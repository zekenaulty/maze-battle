import type { StreamSnapshot } from '../../../persistence/streamRepository';
import { loadStreamSnapshot } from '../../../persistence/streamRepository';
import type { LaunchConfiguration } from './configuration';
import { checkLab, LAUNCH_LIMITS, launchProvider } from './configuration';
import { appendLaunchEvent, journalWriter, mayPrepare, readLaunchJournal, retainedLaunchPhase, type LaunchJournal } from './journal';
import { claimLaunchLease } from './lease';
import { prepareLaunchScenario } from './scenario';
import { DirectedAgenticaClient } from '../directed/client';
import type { AgenticaMessage } from '../sdk/agentica-host.mjs';
import { messageSummary, readLaunchUsage, type LaunchUsage } from './telemetry';

export interface LaunchView {
  journal?: LaunchJournal; snapshot?: StreamSnapshot; status: string; connection: string;
  busy: boolean; error?: string; usage?: LaunchUsage; usageError?: string;
}
export class LaunchSession {
  view: LaunchView = { status: 'loading', connection: 'disconnected', busy: false };
  private client?: DirectedAgenticaClient;
  private release?: () => void;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private saves: Promise<void> = Promise.resolve();
  private readonly writer = journalWriter();
  private closed = false;
  private pumping = false;
  private lastUsage = 0;
  private generation = 0;
  private pending?: Promise<void>;
  private stepping?: Promise<void>;
  private stopping?: Promise<void>;
  private cancellationFault?: unknown;
  private cancelling = false;
  private readonly publish: (view: LaunchView) => void;
  constructor(publish: (view: LaunchView) => void) { this.publish = publish; }
  private update(patch: Partial<LaunchView>) { this.view = { ...this.view, ...patch }; if (!this.closed) this.publish(this.view); }
  private save(patch: Partial<LaunchJournal> = {}) {
    if (!this.view.journal) throw new Error('Launch journal is missing.');
    const journal = { ...this.view.journal, ...patch };
    this.update({ journal });
    this.saves = this.writer(journal);
    return this.saves;
  }
  private fail(error: unknown) {
    this.pumping = false;
    const message = error instanceof Error ? error.message : String(error);
    const journal = this.view.journal;
    const phase = journal && ['running', 'starting'].includes(journal.phase) ? 'recovery-required' : journal?.phase;
    this.update({ error: message, status: phase ?? 'failed', ...(journal && phase ? { journal: { ...journal, phase, error: message } } : {}) });
  }
  async load() {
    try {
      const journal = await readLaunchJournal();
      if (this.closed) return;
      this.update({ journal: journal && { ...journal, phase: retainedLaunchPhase(journal) }, status: journal ? retainedLaunchPhase(journal) : 'idle' });
      if (journal?.destinations.length) await this.refresh();
    } catch (error) { this.fail(error); }
  }
  private async own() {
    if (this.closed) throw new Error('Launcher is closed.');
    if (!this.release) {
      const release = await claimLaunchLease();
      if (this.closed) { release(); throw new Error('Launcher is closed.'); }
      this.release = release;
      const latest = await readLaunchJournal();
      if (latest?.slot !== this.view.journal?.slot || (latest?.runId ?? '') !== (this.view.journal?.runId ?? '')
        || (latest && retainedLaunchPhase(latest) !== retainedLaunchPhase(this.view.journal!))) {
        this.release(); this.release = undefined;
        throw new Error('Saved launch changed in another tab. Reload before continuing.');
      }
    }
  }
  private work(action: () => Promise<void>): Promise<void> {
    if (this.view.busy) return Promise.resolve();
    this.update({ busy: true, error: undefined });
    this.pending = (async () => {
      try { await this.own(); if (this.closed) throw new Error('Launcher is closed.'); await action(); }
      catch (error) { this.fail(error); }
      finally { this.update({ busy: false }); }
    })();
    return this.pending;
  }
  prepare(config: LaunchConfiguration) { return this.work(async () => {
    if (!mayPrepare(this.view.journal)) throw new Error('Resolve the retained launch before preparing another.');
    await this.client?.close(); this.client = undefined; this.pumping = false;
    const slot = `lab-${crypto.randomUUID()}`;
    this.abort = new AbortController();
    this.update({ journal: { version: 1, slot, phase: 'preparing', config, destinations: [], selected: 0, events: [] }, usage: undefined });
    await this.save();
    try {
      const scenario = await prepareLaunchScenario(slot, status => this.update({ status }), this.abort.signal);
      await this.save({ ...scenario, phase: 'prepared' }); this.update({ status: 'prepared' }); await this.refresh();
    } catch (error) { await this.save({ phase: 'failed' }); throw error; }
    finally { this.abort = undefined; }
  }); }
  private connect() {
    const journal = this.view.journal!;
    this.client = new DirectedAgenticaClient({ slot: journal.slot, url: journal.config.url,
      destination: journal.destinations[journal.selected].address, inspectOnArrival: true,
      provider: launchProvider(journal.config), limits: LAUNCH_LIMITS,
      onMessage: message => this.message(message),
      onStatus: status => this.update({ connection: status.state }),
    });
    return this.client;
  }
  start(config: LaunchConfiguration, selected: number) {
    const generation = this.generation;
    const active = () => !this.closed && generation === this.generation;
    return this.work(async () => {
    const journal = this.view.journal;
    if (!journal || journal.phase !== 'prepared' || !journal.destinations[selected] || journal.runId) throw new Error('This launch is not ready for a new start.');
    if (!active()) return;
    this.update({ status: 'checking-lab' });
    await checkLab(config);
    if (!active()) return;
    await this.save({ config, selected, phase: 'starting', error: undefined });
    if (!active()) { await this.save({ phase: 'prepared' }); return; }
    this.update({ status: 'starting' });
    const client = this.connect();
    try {
      const binding = await client.start();
      await this.save({ runId: binding.runId, originalRunId: binding.runId });
      await this.capture(); this.pump();
    } catch (error) { await this.capture(); throw error; }
  }); }
  recover() {
    const generation = this.generation;
    return this.work(async () => {
    const journal = this.view.journal;
    if (!journal?.runId) throw new Error('No confirmed run ID. Inspect Lab before authorizing a replacement launch.');
    this.pumping = false; await this.client?.close();
    if (this.closed || generation !== this.generation) return;
    this.cancellationFault = undefined;
    this.update({ status: 'reconciling' });
    await this.connect().recover(journal.runId); await this.capture(); await this.refreshUsage();
    // Recovery may reconcile an existing wake, but never adopts browser movement.
  }); }
  adopt() { return this.work(async () => {
    if (this.client?.status !== 'awaiting-adoption') throw new Error('Recover the original journey before adoption.');
    await this.client.adopt(); await this.capture(); this.pump();
  }); }
  stop(): Promise<void> {
    this.generation++;
    this.abort?.abort(); this.pumping = false;
    if (!this.client) {
      if (this.view.journal?.phase === 'prepared') this.update({ status: 'prepared' });
      return Promise.resolve();
    }
    if (this.stopping) return this.stopping;
    this.cancelling = true;
    this.update({ status: 'stopping', error: undefined });
    this.stopping = (async () => {
      try { await this.client!.cancel(); } catch (error) { this.cancellationFault = error; }
      await this.pending;
      this.cancelling = false;
      try { await this.capture(); await this.refresh(); await this.refreshUsage(); }
      catch (error) { this.fail(error); }
      if (this.cancellationFault) this.fail(this.cancellationFault);
    })().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  private message(message: AgenticaMessage) {
    if (!this.view.journal || this.closed) return;
    const runId = this.client?.recoverableRunId;
    if (message.runId && runId && message.runId !== runId) return;
    const journal = appendLaunchEvent(this.view.journal, message.type, messageSummary(message));
    // The durable client validates the run binding; this ID is a recovery hint,
    // never sufficient authority for actions or adoption.
    if (runId) { journal.runId = runId; journal.originalRunId ??= runId; }
    void this.save(journal).catch(error => { this.fail(error); void this.client?.close(); });
  }
  private async capture() {
    if (this.closed) return;
    const client = this.client!;
    const status = client.unresolvedStart || client.unresolvedCancellation || this.cancellationFault ? 'unresolved'
      : this.cancelling ? 'stopping' : client.status;
    const phase = status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled'
      : ['failed', 'blocked', 'planInvalid'].includes(status) ? 'failed'
      : ['awaiting-adoption', 'unresolved', 'stopping'].includes(status) ? 'recovery-required' : 'running';
    await this.save({ phase, ...(client.currentRun ? { runId: client.currentRun.runId } : {}) });
    this.update({ status });
  }
  private async refresh() { if (this.view.journal) this.update({ snapshot: await loadStreamSnapshot(this.view.journal.slot) }); }
  private async refreshUsage() {
    const journal = this.view.journal;
    if (!journal?.runId) return;
    this.lastUsage = Date.now();
    try { this.update({ usage: await readLaunchUsage(journal.config.url, journal.runId), usageError: undefined }); }
    catch { this.update({ usageError: 'Lab usage unavailable' }); }
  }
  private pump() {
    if (this.closed || !this.client) return;
    this.pumping = true;
    const step = async () => {
      if (!this.pumping || this.closed) return;
      try {
        if (!this.client!.connected) throw new Error('Lab disconnected. Recover the original run; no automatic retry.');
        await this.client!.tick();
        if (!this.pumping || this.closed) return;
        await this.capture(); await this.refresh();
        if (Date.now() - this.lastUsage > 2000 || this.view.journal!.phase !== 'running') await this.refreshUsage();
        if (this.view.journal!.phase !== 'running') this.pumping = false;
      } catch (error) { this.fail(error); }
      if (this.pumping && !this.closed) this.timer = setTimeout(() => { this.stepping = step(); }, 250);
    };
    this.timer = setTimeout(() => { this.stepping = step(); }, 250);
  }
  async close() {
    this.closed = true; this.generation++; this.pumping = false; this.abort?.abort(); clearTimeout(this.timer);
    await Promise.allSettled([this.client?.close(), this.pending, this.stepping, this.stopping]);
    try { await this.saves; } finally { this.release?.(); this.release = undefined; }
  }
}

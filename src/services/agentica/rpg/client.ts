import type { GameSession } from '../../game/GameSession';
import type { RpgAddress } from '../../../domain/agentic/knowledge/types';
import type { AgenticaStart } from '../contracts';
import type { HostOperationEvent } from '../sdk/agentica-host.mjs';
import { prepareRpgLaunch } from '../../../persistence/rpgAgentica/launch';
import { markRpgLaunch, readRpgLaunch, stopRpgRun, type RpgLaunch } from '../../../persistence/rpgAgentica/launchRecords';
import { acknowledgeRpgHostEvent, stageRpgHostEvent } from '../../../persistence/rpgAgentica/events';
import { equivalentHostWire } from '../directed/wire';
import { RpgAgenticaTransport } from './transport';
import { confirmRpgAdmission, retainedRpgJourney } from './journey';
import { rpgRunStatus } from './lifecycle';
import { requireRpg } from './validation';

export interface RpgAgenticaView {
  state: string; connected: boolean; steps: number; replans: number;
  detail?: string; runId?: string; operationId?: string; target?: RpgAddress;
}
export interface RpgAgenticaOptions {
  session: GameSession; url: string; target: RpgAddress;
  provider?: AgenticaStart['provider']; limits?: AgenticaStart['limits']; onChange?(view: RpgAgenticaView): void;
}
const terminal = (kind: string) => ['completed', 'cancelled', 'blocked'].includes(kind);

/** Coordinates the real game's command queue; never owns another world or chooses a route. */
export class RpgAgenticaClient {
  view: RpgAgenticaView;
  private readonly options: RpgAgenticaOptions;
  private readonly transport: RpgAgenticaTransport;
  private launch?: RpgLaunch;
  private work?: Promise<unknown>;
  private abort = new AbortController();
  private closed = false;
  private stopped = false;
  private stopping?: Promise<void>;
  private confirmed?: string;
  private nextAdmissionCheck = 0;
  constructor(options: RpgAgenticaOptions) {
    this.options = { ...options, target: structuredClone(options.target) };
    this.view = { state: 'idle', connected: false, steps: 0, replans: 0, target: structuredClone(options.target) };
    this.abort.abort();
    this.transport = new RpgAgenticaTransport(options.session, options.url, () => this.abort.signal, message => {
      const state = rpgRunStatus(message, this.transport.binding?.runId);
      if (state && !this.closed && !this.stopped && !this.abort.signal.aborted && !terminal(this.view.state)) this.publish({ state });
      if (state === 'parked') this.nextAdmissionCheck = 0;
    });
  }
  private publish(patch: Partial<RpgAgenticaView>) {
    this.view = { ...this.view, ...patch, connected: this.transport.sdk.connected };
    try { this.options.onChange?.(structuredClone(this.view)); } catch { /* Display observers grant no authority. */ }
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed || this.work) return Promise.reject(new Error('Agentic transition is closed or already in progress.'));
    const pending = work(); this.work = pending;
    void pending.finally(() => { if (this.work === pending) this.work = undefined; }).catch(() => {});
    return pending;
  }
  private active(signal: AbortSignal) { return !this.closed && !this.stopped && !signal.aborted; }
  private async refresh() {
    const game = this.options.session.view.game;
    requireRpg(game, 'game unavailable');
    const launch = await readRpgLaunch(game.id);
    requireRpg(launch && (!this.launch || launch.id === this.launch.id), 'original launch changed');
    this.launch = launch;
    this.publish({ runId: launch.binding?.runId, operationId: launch.operationId, target: launch.draft.completionTarget });
    return launch;
  }
  start() { return this.exclusive(async () => {
    requireRpg(!this.launch && !this.stopped, 'Reconnect the original launch instead of starting it again.');
    this.abort = new AbortController(); const signal = this.abort.signal;
    this.publish({ state: 'preparing', detail: undefined });
    const memory = await this.options.session.prepareTravelMemory();
    requireRpg(this.active(signal), 'launch paused');
    requireRpg(memory.status === 'ready', 'Earned memory is still preparing. Start again from this checkpoint.');
    this.launch = await prepareRpgLaunch(this.options.session.ownedControl(), {
      url: this.options.url, target: this.options.target, provider: this.options.provider, limits: this.options.limits,
    });
    if (!this.active(signal)) { await markRpgLaunch(this.launch.id, { stopped: true, stopAcknowledged: true }); return; }
    this.publish({ state: 'starting' });
    await this.transport.start(this.launch); await this.refresh();
    if (this.stopped) await this.transport.cancel();
    else if (this.active(signal)) this.publish({ state: 'planning' });
  }); }
  pause() {
    this.abort.abort();
    if (!terminal(this.view.state) && this.view.state !== 'idle') this.publish({ state: 'paused' });
  }
  close() { this.pause(); this.closed = true; this.transport.close(); }

  private async deliver(event: HostOperationEvent, allowWake: boolean) {
    requireRpg(this.launch, 'launch unavailable');
    if (event.kind === 'decision') {
      if (!allowWake) { this.publish({ state: 'awaiting-adoption', detail: 'A retained decision needs explicit continuation.' }); return; }
      const signal = this.abort.signal, memory = await this.options.session.prepareTravelMemory();
      if (!this.active(signal) || memory.status !== 'ready') return;
      this.publish({ state: 'planning' });
      await this.transport.wake(event); await this.refresh(); this.confirmed = undefined;
      return;
    }
    const receipt = await this.transport.sdk.signalOperation(event, { fetchImpl: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) });
    requireRpg(equivalentHostWire(receipt.latestEvent, event, 'event'), 'service acknowledgement differs from original event');
    await acknowledgeRpgHostEvent(event);
    if (terminal(event.kind)) {
      this.abort.abort();
      await stopRpgRun(this.launch.binding!.runId);
      this.launch = await markRpgLaunch(this.launch.id, { stopped: true, stopAcknowledged: true });
    }
    this.publish({ state: terminal(event.kind) ? event.kind : this.abort.signal.aborted ? 'paused' : 'travelling', detail: event.summary });
  }
  tick() { return this.exclusive(async () => {
    const signal = this.abort.signal;
    if (!this.active(signal)) return;
    if (!this.transport.sdk.connected) { this.pause(); this.publish({ state: 'disconnected' }); return; }
    const launch = await this.refresh(), retained = await retainedRpgJourney(this.options.session, launch);
    if (!this.active(signal) || !retained) return;
    this.publish({ steps: retained.travel.operation.steps, replans: retained.travel.operation.replans });
    if (this.confirmed !== launch.operationId) {
      if (Date.now() < this.nextAdmissionCheck) return;
      this.nextAdmissionCheck = Date.now() + 1000;
      if (!await confirmRpgAdmission(this.transport, this.options.session, launch)) return;
      this.confirmed = launch.operationId;
    }
    if (!this.active(signal)) return;
    const { link, event, travel } = retained;
    if (event && (link.sequence !== link.acknowledged || event.kind === 'decision')) {
      await this.deliver(event, true); return;
    }
    if (event && terminal(event.kind)) { this.abort.abort(); this.publish({ state: event.kind }); return; }
    if (retained.adoptionRequired) { this.pause(); this.publish({ state: 'awaiting-adoption' }); return; }
    if (travel.operation.status !== 'running') {
      await this.deliver(await stageRpgHostEvent(travel.id, this.options.session.ownedControl()), true); return;
    }
    const memory = await this.options.session.prepareTravelMemory();
    if (!this.active(signal) || memory.status !== 'ready') return;
    const outcome = await this.options.session.advanceAgenticaOperation(this.options.session.travelRequest(travel.id,
      { type: 'step', sequence: travel.operation.nextStep }), signal);
    if (outcome.receipt?.travel) this.publish({ steps: outcome.receipt.travel.operation.steps, replans: outcome.receipt.travel.operation.replans });
    if (!this.active(signal)) return;
    if (outcome.event) await this.deliver(outcome.event, true);
    else { this.pause(); this.publish({ detail: outcome.receipt?.reason, state: 'awaiting-adoption' }); }
  }); }

  recover() { return this.exclusive(async () => {
    this.pause(); this.publish({ state: 'reconciling', detail: undefined });
    const launch = await this.refresh();
    requireRpg(launch.url === new URL(this.options.url).href, 'Reconnect to the original endpoint.');
    const entry = await this.transport.recover(launch);
    this.confirmed = entry?.admission?.operation?.operationId;
    const retained = await retainedRpgJourney(this.options.session, launch);
    if (retained) {
      this.publish({ steps: retained.travel.operation.steps, replans: retained.travel.operation.replans });
      if (retained.event && retained.link.sequence !== retained.link.acknowledged) await this.deliver(retained.event, false);
      if (retained.event && terminal(retained.event.kind)) { this.publish({ state: retained.event.kind }); return; }
    }
    this.publish({ state: 'awaiting-adoption', detail: launch.stopped ? 'Local work is stopped; reconcile cancellation.' : 'Reconnected. Local execution remains paused.' });
  }); }
  adopt() { return this.exclusive(async () => {
    const launch = await this.refresh();
    requireRpg(!this.stopped && !launch.stopped, 'Stopped work cannot be adopted.');
    requireRpg(this.transport.sdk.connected, 'Reconnect before adoption.');
    const retained = await retainedRpgJourney(this.options.session, launch);
    requireRpg(retained && await confirmRpgAdmission(this.transport, this.options.session, launch), 'No settled journey to adopt.');
    this.confirmed = launch.operationId;
    this.abort = new AbortController(); const signal = this.abort.signal;
    if (retained.event && (retained.link.sequence !== retained.link.acknowledged || retained.event.kind === 'decision')) {
      await this.deliver(retained.event, true);
      if (!this.active(signal) || retained.event.kind === 'decision') return;
    }
    requireRpg(retained.travel.operation.status === 'running', 'The original journey is already terminal.');
    const memory = await this.options.session.prepareTravelMemory();
    requireRpg(memory.status === 'ready' && this.active(signal), 'Adoption paused or memory still preparing.');
    const outcome = await this.options.session.advanceAgenticaOperation(this.options.session.travelRequest(retained.travel.id, { type: 'adopt' }), signal);
    requireRpg(outcome.receipt?.disposition === 'applied', outcome.receipt?.reason ?? 'Adoption not applied.');
    if (outcome.event && this.active(signal)) await this.deliver(outcome.event, false);
  }); }
  cancel(): Promise<void> {
    this.pause(); this.stopped = true; this.publish({ state: 'stopping' });
    return this.stopping ??= this.stop().finally(() => { this.stopping = undefined; });
  }
  private async stop() {
    if (this.launch) await markRpgLaunch(this.launch.id, { stopped: true });
    await this.work?.catch(() => {});
    if (!this.launch) { this.publish({ state: 'cancelled' }); return; }
    const launch = await this.refresh(); await markRpgLaunch(launch.id, { stopped: true });
    if (launch.binding) await stopRpgRun(launch.binding.runId);
    const retained = await retainedRpgJourney(this.options.session, launch);
    if (retained?.travel.operation.status === 'running') {
      const outcome = await this.options.session.advanceAgenticaOperation(this.options.session.travelRequest(retained.travel.id, { type: 'cancel' }));
      requireRpg(outcome.receipt?.disposition === 'applied', 'Local cancellation needs current game custody.');
      if (outcome.event) await this.deliver(outcome.event, false);
      if (outcome.event?.kind !== 'cancelled')
        await this.deliver(await stageRpgHostEvent(retained.travel.id, this.options.session.ownedControl()), false);
    } else if (retained?.event && retained.link.sequence !== retained.link.acknowledged && retained.event.kind !== 'decision') {
      await this.deliver(retained.event, false);
    }
    if (retained?.travel.operation.status === 'cancelled' && retained.event?.kind !== 'cancelled')
      await this.deliver(await stageRpgHostEvent(retained.travel.id, this.options.session.ownedControl()), false);
    if (!this.launch!.stopAcknowledged) {
      if (!launch.sent) this.launch = await markRpgLaunch(launch.id, { stopAcknowledged: true });
      else { requireRpg(launch.binding, 'Original service start identity is unresolved; local execution is stopped.'); await this.transport.cancel(); }
    }
    this.publish({ state: 'cancelled', detail: 'Local execution stopped; original service work reconciled.' });
  }
}

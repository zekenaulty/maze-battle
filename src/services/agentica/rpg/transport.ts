import { AgenticaHost, type AgenticaMessage, type HostOperationEvent } from '../sdk/agentica-host.mjs';
import { deferred, fixtureUrl } from '../clientPolicy';
import { equivalentHostWire } from '../directed/wire';
import type { GameSession } from '../../game/GameSession';
import { bindRpgRun, readRpgRun } from '../../../persistence/rpgAgentica/runs';
import { loadRpgAction, saveRpgAction } from '../../../persistence/rpgAgentica/records';
import { announceRpgLaunch, markRpgLaunch, stopRpgRun, type RpgLaunch } from '../../../persistence/rpgAgentica/launchRecords';
import { rpgStartedBinding } from './lifecycle';
import { parseRpgAction, requireRpg } from './validation';
import type { RpgAgenticaBinding } from './contracts';
import { prepareRpgWake, acknowledgeRpgWake, finishRpgWake } from '../../../persistence/rpgAgentica/launchWake';
import { rpgFetch } from './network';

export class RpgAgenticaTransport {
  readonly sdk: AgenticaHost;
  binding?: RpgAgenticaBinding;
  private ready = deferred<void>();
  private closed = false;
  private startAttempted = false;
  private announcement?: Promise<unknown>;
  private launch?: RpgLaunch;
  private announcing = false;
  private readonly session: GameSession;
  private readonly signal: () => AbortSignal;
  constructor(session: GameSession, url: string, signal: () => AbortSignal, onMessage: (message: AgenticaMessage) => void) {
    this.session = session; this.signal = signal;
    this.sdk = new AgenticaHost({ url: fixtureUrl(url), maxMessages: 128,
      loadAction: async key => { await this.ready.promise; return loadRpgAction(key); },
      saveAction: async (key, record) => { await this.ready.promise; await saveRpgAction(key, record); },
      onAction: async action => {
        await this.ready.promise; requireRpg(this.binding, 'missing run binding'); parseRpgAction(action, this.binding);
        const signal = this.signal();
        if (this.closed || !this.sdk.connected || signal.aborted) return session.executeAgenticaAction(action, true);
        try {
          // Immediate effects create a new observation too; prepare its derived memory before the next tool.
          if (this.binding.mode === 'quest') await session.prepareTravelMemory();
          return await session.executeAgenticaAction(action, false, signal);
        }
        catch (error) { if (signal.aborted) return session.executeAgenticaAction(action, true); throw error; }
      },
      reconcileAction: async action => { await this.ready.promise; return session.executeAgenticaAction(action, true); },
      onMessage: message => {
        if (message.type === 'started' && this.launch && this.announcing) {
          try {
            const binding = rpgStartedBinding(this.launch.wake?.adoptedDraft ?? this.launch.wake?.draft ?? this.launch.draft, message.payload);
            requireRpg(binding.runId === message.runId && message.requestId, 'invalid start announcement');
            this.binding = binding;
            this.announcement = announceRpgLaunch(this.launch.id, binding);
            void this.announcement.catch(() => {});
          } catch { /* Unmatched transport data establishes no authority. */ }
        }
        onMessage(message);
      },
    });
  }
  async start(launch: RpgLaunch) {
    requireRpg(!this.startAttempted && !this.closed && !this.signal().aborted, 'original start requires reconciliation');
    this.startAttempted = true; this.announcing = true; this.launch = structuredClone(launch);
    try {
      await markRpgLaunch(launch.id, { sent: true });
      if (this.closed || this.signal().aborted) {
        await markRpgLaunch(launch.id, { stopped: true, stopAcknowledged: true });
        throw new Error('Launch paused before dispatch. No service start was sent.');
      }
      const started = await this.sdk.start(launch.request), binding = rpgStartedBinding(launch.draft, started);
      await this.announcement;
      requireRpg(this.binding?.runId === binding.runId && this.binding.manifestHash === binding.manifestHash, 'missing matching service announcement');
      await announceRpgLaunch(launch.id, binding);
      await bindRpgRun(binding);
      this.binding = binding; this.announcing = false; this.ready.resolve();
      return binding;
    } catch (error) { this.ready.reject(error instanceof Error ? error : new Error(String(error))); throw error; }
  }
  async wake(event: HostOperationEvent, adopt = false) {
    requireRpg(this.launch && !this.closed && !this.signal().aborted, 'wake requires active explicit authority');
    this.launch = await prepareRpgWake(this.launch.id, event, this.session.ownedControl(), adopt);
    requireRpg(!this.closed && !this.signal().aborted, 'wake paused before dispatch');
    this.ready = deferred<void>(); this.announcing = true;
    try {
      const wake = this.launch.wake!;
      const started = wake.adoption ? await this.sdk.adoptDecision(event, wake.adoption) : await this.sdk.wakeOperation(event);
      const binding = rpgStartedBinding(wake.adoptedDraft ?? wake.draft, started);
      await this.announcement;
      requireRpg(this.binding?.runId === binding.runId && this.binding.manifestHash === binding.manifestHash, 'successor announcement mismatch');
      await announceRpgLaunch(this.launch.id, binding);
      await acknowledgeRpgWake(this.launch.id, event);
      await bindRpgRun(binding);
      this.launch = await finishRpgWake(this.launch.id);
      this.binding = binding; this.announcing = false; this.ready.resolve();
      return binding;
    } catch (error) {
      // The service may publish parked before its execution task has fully unwound.
      // This explicit pre-admission refusal permits retry of the SAME retained decision only.
      if (error instanceof Error && 'code' in error && error.code === 'connection.busy') {
        this.announcing = false; this.ready.resolve(); return undefined;
      }
      this.ready.reject(error instanceof Error ? error : new Error(String(error))); throw error;
    }
  }
  async recover(launch: RpgLaunch, signal?: AbortSignal) {
    requireRpg(launch.binding, 'Original start identity is unresolved. A new start is not a retry.');
    this.launch = structuredClone(launch); this.binding = launch.binding;
    if (launch.wake) {
      const entries = await this.sdk.listOperations({ hostId: 'maze-battle', sessionId: launch.binding.sessionId, fetchImpl: rpgFetch(signal) });
      const parent = entries.find(e => e.admission?.operation?.operationId === launch.wake!.event.operationId);
      if (parent?.wakeRunId && !launch.wake.binding) {
        const wake = launch.wake, draft = wake.adoptedDraft ?? wake.draft;
        requireRpg(parent.activeEpoch === draft.sessionEpoch && equivalentHostWire(parent.latestEvent, wake.event, 'event')
          && equivalentHostWire(parent.wakeAdoption ?? null, wake.adoption ?? null, 'adoption')
          && equivalentHostWire(parent.admission, await this.session.executeAgenticaAction(parent.action, true), 'result'),
          'claimed successor differs from the original decision');
        // Resume only the service-proven claim. Never redeliver a wake while recovering.
        const response = await this.sdk.resume({ runId: parent.wakeRunId, sessionId: draft.sessionId, sessionEpoch: draft.sessionEpoch });
        requireRpg(response.type === 'resumed' && response.payload.runId === parent.wakeRunId, 'claimed successor resume mismatch');
        const binding = rpgStartedBinding(draft, response.payload);
        launch = await announceRpgLaunch(launch.id, binding); this.launch = launch; this.binding = binding;
      }
      if (launch.wake?.binding) {
        requireRpg(parent?.wakeRunId === launch.wake.binding.runId
          && parent.activeEpoch === launch.wake.binding.sessionEpoch
          && equivalentHostWire(parent.wakeAdoption ?? null, launch.wake.adoption ?? null, 'adoption')
          && equivalentHostWire(parent.latestEvent, launch.wake.event, 'event')
          && equivalentHostWire(parent.admission, await this.session.executeAgenticaAction(parent.action, true), 'result'),
          'retained successor differs from the original service wake');
        // Bind only the original grant. A different owner/revision is not substituted here.
        try { await acknowledgeRpgWake(launch.id, launch.wake.event); await bindRpgRun(launch.wake.binding); }
        catch (error) { await this.attachForStop(launch.wake.binding); throw error; }
        launch = await finishRpgWake(launch.id); this.launch = launch; this.binding = launch.binding;
      }
    }
    requireRpg(launch.binding, 'missing retained successor');
    const bound = await readRpgRun(launch.binding.runId);
    if (!bound) {
      // An announced start that lost local custody can be stopped, never rebound as fresh authority.
      await this.attachForStop(launch.binding);
      return;
    }
    this.ready.resolve();
    try {
      const response = await this.sdk.resume({ runId: bound.runId, sessionId: bound.sessionId, sessionEpoch: bound.sessionEpoch });
      requireRpg(response.type === 'resumed' && response.payload.runId === bound.runId
        && response.payload.sessionId === bound.sessionId && response.payload.sessionEpoch === bound.sessionEpoch
        && response.payload.manifestHash === bound.manifestHash, 'resumed run mismatch');
    } catch {
      const receipts = await this.sdk.recover({ hostId: bound.hostId, sessionId: bound.sessionId, fetchImpl: rpgFetch(signal) });
      requireRpg(receipts.every(r => r.resolved), 'original service custody unresolved');
    }
    const entries = await this.sdk.listOperations({ hostId: bound.hostId, sessionId: bound.sessionId, fetchImpl: rpgFetch(signal) });
    const operation = entries.find(e => e.action.runId === bound.runId && e.admission?.operation?.operationId === launch.operationId);
    if (operation) requireRpg(equivalentHostWire(operation.admission, await this.session.executeAgenticaAction(operation.action, true), 'result'),
      'service admission differs from original receipt');
    return operation;
  }
  private async attachForStop(binding: RpgAgenticaBinding) {
    this.ready.reject(new Error('Original start has no current local effect grant.'));
    this.binding = binding;
    const response = await this.sdk.resume({ runId: binding.runId, sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch });
    requireRpg(response.type === 'resumed' && response.payload.runId === binding.runId
      && response.payload.sessionId === binding.sessionId && response.payload.sessionEpoch === binding.sessionEpoch
      && response.payload.manifestHash === binding.manifestHash, 'unbound original resume mismatch');
  }
  async cancel(acknowledgeLaunch = true) {
    const binding = this.binding; if (!binding) return;
    await stopRpgRun(binding.runId);
    requireRpg(this.sdk.connected, 'Local work is stopped; service cancellation needs reconnect.');
    await this.sdk.stop(binding.runId);
    if (this.launch && acknowledgeLaunch) await markRpgLaunch(this.launch.id, { stopAcknowledged: true });
  }
  close() { this.closed = true; this.ready.reject(new Error('Agentic transport closed.')); this.sdk.close(); }
}

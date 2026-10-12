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
import { prepareRpgWake, finishRpgWake } from '../../../persistence/rpgAgentica/launchWake';
import { acknowledgeRpgHostEvent } from '../../../persistence/rpgAgentica/events';

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
        try { return await session.executeAgenticaAction(action, false, signal); }
        catch (error) { if (signal.aborted) return session.executeAgenticaAction(action, true); throw error; }
      },
      reconcileAction: async action => { await this.ready.promise; return session.executeAgenticaAction(action, true); },
      onMessage: message => {
        if (message.type === 'started' && this.launch && this.announcing) {
          try {
            const binding = rpgStartedBinding(this.launch.wake?.draft ?? this.launch.draft, message.payload);
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
  async wake(event: HostOperationEvent) {
    requireRpg(this.launch && !this.closed && !this.signal().aborted, 'wake requires active explicit authority');
    this.launch = await prepareRpgWake(this.launch.id, event, this.session.ownedControl());
    requireRpg(!this.closed && !this.signal().aborted, 'wake paused before dispatch');
    this.ready = deferred<void>(); this.announcing = true;
    try {
      const started = await this.sdk.wakeOperation(event);
      const binding = rpgStartedBinding(this.launch.wake!.draft, started);
      await this.announcement;
      requireRpg(this.binding?.runId === binding.runId && this.binding.manifestHash === binding.manifestHash, 'successor announcement mismatch');
      await announceRpgLaunch(this.launch.id, binding);
      await acknowledgeRpgHostEvent(event);
      await bindRpgRun(binding);
      this.launch = await finishRpgWake(this.launch.id);
      this.binding = binding; this.announcing = false; this.ready.resolve();
      return binding;
    } catch (error) { this.ready.reject(error instanceof Error ? error : new Error(String(error))); throw error; }
  }
  async recover(launch: RpgLaunch) {
    requireRpg(launch.binding, 'Original start identity is unresolved. A new start is not a retry.');
    this.launch = structuredClone(launch); this.binding = launch.binding;
    const bound = await readRpgRun(launch.binding.runId);
    requireRpg(bound, 'Original run was announced but not locally bound; reconcile launch custody first.');
    this.ready.resolve();
    try {
      const response = await this.sdk.resume({ runId: bound.runId, sessionId: bound.sessionId, sessionEpoch: bound.sessionEpoch });
      requireRpg(response.type === 'resumed' && response.payload.runId === bound.runId
        && response.payload.sessionId === bound.sessionId && response.payload.sessionEpoch === bound.sessionEpoch
        && response.payload.manifestHash === bound.manifestHash, 'resumed run mismatch');
    } catch {
      const receipts = await this.sdk.recover({ hostId: bound.hostId, sessionId: bound.sessionId });
      requireRpg(receipts.every(r => r.resolved), 'original service custody unresolved');
    }
    const entries = await this.sdk.listOperations({ hostId: bound.hostId, sessionId: bound.sessionId });
    const operation = entries.find(e => e.action.runId === bound.runId && e.admission?.operation?.operationId === launch.operationId);
    if (operation) requireRpg(equivalentHostWire(operation.admission, await this.session.executeAgenticaAction(operation.action, true), 'result'),
      'service admission differs from original receipt');
    return operation;
  }
  async cancel() {
    const binding = this.binding; if (!binding) return;
    await stopRpgRun(binding.runId);
    requireRpg(this.sdk.connected, 'Local work is stopped; service cancellation needs reconnect.');
    await this.sdk.stop(binding.runId);
    if (this.launch) await markRpgLaunch(this.launch.id, { stopAcknowledged: true });
  }
  close() { this.closed = true; this.ready.reject(new Error('Agentic transport closed.')); this.sdk.close(); }
}

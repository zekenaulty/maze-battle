import { AgenticaHost, type AgenticaMessage, type AgenticaStarted, type AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult, AgenticaStart } from '../contracts';
import type { DirectedAgenticaBinding } from './contracts';
import { parseDirectedAgenticaCommand } from './commands';
import { DirectedRunLifecycle, directedStartedBinding, type DirectedAgenticaStatus } from './lifecycle';
import { deferred, fixtureUrl } from '../clientPolicy';
import { equivalentHostWire } from './wire';
import type { DirectedHostEvent } from '../../../persistence/directedAgentica/types';
import { loadDirectedStreamSession } from '../../../persistence/directedStreamRepository';
import { bindDirectedAgenticaRun, loadDirectedAgenticaRun } from '../../../persistence/directedAgentica/runs';
import { loadDirectedAgenticaAction, saveDirectedAgenticaAction, executeDirectedAgenticaAction,
  settleDirectedAgenticaAction } from '../../../persistence/directedAgentica/actions';

export class DirectedAgenticaTransport {
  readonly sdk: AgenticaHost;
  readonly lifecycle = new DirectedRunLifecycle();
  binding?: DirectedAgenticaBinding;
  private ready = deferred<void>();
  private closed = false;
  private cancelled = false;
  private startAttempted = false;
  private readonly stops = new Map<string, Promise<void>>();
  readonly slot: string;
  constructor(slot: string, url: string, onMessage?: (message: AgenticaMessage, state?: string) => void,
    onStatus?: (status: DirectedAgenticaStatus) => void) {
    this.slot = slot;
    this.sdk = new AgenticaHost({ url: fixtureUrl(url), maxMessages: 128, maxActions: 2048,
      loadAction: async key => { await this.ready.promise; return loadDirectedAgenticaAction(slot, key); },
      saveAction: async (key, record) => { await this.ready.promise; await saveDirectedAgenticaAction(slot, key, record); },
      onAction: action => this.execute(action),
      reconcileAction: async action => { await this.ready.promise; return settleDirectedAgenticaAction(slot, action); },
      onMessage: message => {
        const state = this.lifecycle.message(message);
        if (this.cancelled) void this.stopRun().catch(() => undefined);
        try { onMessage?.(message, state); } catch { /* Display cannot change custody. */ }
      },
      onStatus: status => { try { onStatus?.(status); } catch { /* Connectivity is not journey completion. */ } },
    });
  }
  async start(draft: DirectedAgenticaBinding, request: AgenticaStart) {
    if (this.startAttempted || this.cancelled || this.closed) throw new Error('Original directed start requires reconciliation.');
    this.startAttempted = true;
    this.lifecycle.begin(draft);
    try {
      const response = await this.sdk.start(request);
      if (this.closed) throw new Error('Transport closed during start.');
      if (this.cancelled) { await this.stopRun(); throw new Error('Directed start was cancelled.'); }
      await this.bind(draft, response);
      if (this.cancelled || this.closed) { await this.stopRun(); throw new Error('Directed start was cancelled.'); }
      this.ready.resolve();
      return structuredClone(this.binding!);
    } catch (error) {
      this.cancelled = true;
      this.ready.reject(error instanceof Error ? error : new Error('Directed start failed.'));
      this.lifecycle.failed(error);
      await this.stopRun().catch(() => undefined);
      throw error;
    }
  }
  private async bind(draft: DirectedAgenticaBinding, started: AgenticaStarted) {
    const binding = directedStartedBinding(draft, started);
    if (this.lifecycle.announced?.runId !== binding.runId || this.lifecycle.announced.manifestHash !== binding.manifestHash) {
      throw new Error('Expected a matching directed started envelope.');
    }
    await bindDirectedAgenticaRun(this.slot, binding);
    this.binding = binding;
  }
  private async execute(action: AgenticaAction): Promise<AgenticaResult> {
    await this.ready.promise;
    if (!this.binding) throw new Error('Missing directed run binding.');
    parseDirectedAgenticaCommand(action, this.binding);
    // Disconnect can reconcile custody, but cannot admit a fresh effect.
    return this.closed || this.cancelled || this.lifecycle.terminalStatus || !this.sdk.connected ? settleDirectedAgenticaAction(this.slot, action)
      : executeDirectedAgenticaAction(this.slot, action);
  }
  async wake(event: DirectedHostEvent) {
    if (this.cancelled || this.closed) throw new Error('Directed host no longer admits a wake.');
    if (!this.binding || event.kind !== 'decision') throw new Error('A retained semantic decision is required.');
    const session = await loadDirectedStreamSession(this.slot, event.operationId);
    if (this.cancelled || this.closed) throw new Error('Directed host no longer admits a wake.');
    if (String(session.control.epoch) !== event.sessionEpoch) throw new Error('Semantic wake ownership changed.');
    const draft = { ...this.binding, parentOperationId: event.operationId,
      sessionEpoch: event.sessionEpoch, control: session.control };
    this.ready = deferred<void>();
    this.lifecycle.begin(draft);
    try {
      const started = await this.sdk.wakeOperation(event);
      if (this.cancelled || this.closed) { await this.stopRun(); throw new Error('Directed wake was cancelled.'); }
      await this.bind(draft, started);
      if (this.cancelled || this.closed) { await this.stopRun(); throw new Error('Directed wake was cancelled.'); }
      this.ready.resolve();
      return this.binding!;
    } catch (error) {
      this.ready.reject(error instanceof Error ? error : new Error('Semantic wake is unresolved.'));
      this.lifecycle.failed(error);
      throw error;
    }
  }
  async recover(runId: string): Promise<AgenticaOperationEntry | undefined> {
    const binding = await loadDirectedAgenticaRun(this.slot, runId);
    if (!binding) throw new Error('Original directed run is not retained.');
    this.binding = binding;
    this.lifecycle.begin(binding, true);
    this.ready.resolve();
    // First use the retained live run. After process loss, reconcile the original
    // custody over HTTP; no new start and no replacement provider call.
    try {
      const response = await this.sdk.resume({ runId, sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch });
      if (response.type !== 'resumed' || response.payload.runId !== runId
        || response.payload.sessionId !== binding.sessionId || response.payload.sessionEpoch !== binding.sessionEpoch
        || response.payload.manifestHash !== binding.manifestHash) throw new Error('Retained directed run mismatch.');
    } catch {
      const recovered = await this.sdk.recover({ hostId: 'maze-battle', sessionId: binding.sessionId });
      if (recovered.some(value => !value.resolved)) throw new Error('Original service custody is unresolved.');
    }
    const operations = await this.sdk.listOperations({ hostId: 'maze-battle', sessionId: binding.sessionId });
    const retained = operations.find(value => value.admission?.operation && (value.action.runId === runId
      || value.admission.operation.operationId === binding.parentOperationId));
    if (retained && !equivalentHostWire(retained.admission, await settleDirectedAgenticaAction(this.slot, retained.action), 'result')) {
      throw new Error('Service admission differs from the retained original host result.');
    }
    if (retained?.wakeRunId && retained.wakeRunId !== runId) {
      const successor = await loadDirectedAgenticaRun(this.slot, retained.wakeRunId);
      if (successor?.parentOperationId === retained.admission!.operation!.operationId) return this.recover(successor.runId);
      if (retained.state === 'waking') throw new Error('Original wake has no durable successor binding; reconcile it without a replacement activation.');
    }
    return retained;
  }
  preventDispatch() { this.cancelled = true; this.ready.reject(new Error('Directed start was cancelled.')); }
  cancel() { this.preventDispatch(); return this.stopRun(); }
  private stopRun(): Promise<void> {
    const runId = this.lifecycle.announced?.runId ?? this.binding?.runId;
    if (!runId || this.closed) return Promise.resolve();
    if (!this.stops.has(runId)) {
      // Install the promise before SDK observers can synchronously report cancellation.
      this.stops.set(runId, Promise.resolve().then(async () => {
        if (!this.sdk.connected) throw new Error('Original directed cancellation requires reconciliation.');
        await this.sdk.stop(runId);
      }));
    }
    return this.stops.get(runId)!;
  }
  close() { this.closed = true; this.ready.reject(new Error('Directed host is closed.')); this.sdk.close(); }
}

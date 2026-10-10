import { AgenticaHost, type AgenticaMessage, type AgenticaStarted, type AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult, AgenticaStart } from '../contracts';
import type { DirectedAgenticaBinding } from './contracts';
import { parseDirectedAgenticaCommand, validateDirectedAgenticaBinding } from './commands';
import { deferred, fixtureUrl } from '../clientPolicy';
import { equivalentHostWire } from './wire';
import type { DirectedHostEvent } from '../../../persistence/directedAgentica/types';
import { bindDirectedAgenticaRun, loadDirectedAgenticaRun } from '../../../persistence/directedAgentica/runs';
import { loadDirectedAgenticaAction, saveDirectedAgenticaAction, executeDirectedAgenticaAction,
  settleDirectedAgenticaAction } from '../../../persistence/directedAgentica/actions';

export class DirectedAgenticaTransport {
  readonly sdk: AgenticaHost;
  binding?: DirectedAgenticaBinding;
  private ready = deferred<void>();
  private closed = false;
  readonly slot: string;
  constructor(slot: string, url: string, onMessage?: (message: AgenticaMessage) => void) {
    this.slot = slot;
    this.sdk = new AgenticaHost({ url: fixtureUrl(url), maxMessages: 128, maxActions: 2048,
      loadAction: async key => { await this.ready.promise; return loadDirectedAgenticaAction(slot, key); },
      saveAction: async (key, record) => { await this.ready.promise; await saveDirectedAgenticaAction(slot, key, record); },
      onAction: action => this.execute(action),
      reconcileAction: async action => { await this.ready.promise; return settleDirectedAgenticaAction(slot, action); },
      onMessage: message => { try { onMessage?.(message); } catch { /* Display cannot change custody. */ } },
    });
  }
  async start(draft: DirectedAgenticaBinding, request: AgenticaStart) {
    try {
      const response = await this.sdk.start(request);
      if (this.closed) throw new Error('Transport closed during start.');
      await this.bind(draft, response);
      this.ready.resolve();
      return structuredClone(this.binding!);
    } catch (error) { this.ready.reject(error instanceof Error ? error : new Error('Directed start failed.')); throw error; }
  }
  private async bind(draft: DirectedAgenticaBinding, started: AgenticaStarted) {
    for (const key of ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const) {
      if (started[key] !== draft[key]) throw new Error('Directed Agentica start binding mismatch.');
    }
    const binding = { ...draft, runId: started.runId, manifestHash: started.manifestHash };
    validateDirectedAgenticaBinding(binding);
    await bindDirectedAgenticaRun(this.slot, binding);
    this.binding = binding;
  }
  private async execute(action: AgenticaAction): Promise<AgenticaResult> {
    await this.ready.promise;
    if (!this.binding) throw new Error('Missing directed run binding.');
    parseDirectedAgenticaCommand(action, this.binding);
    // Disconnect can reconcile custody, but cannot admit a fresh effect.
    return this.closed || !this.sdk.connected ? settleDirectedAgenticaAction(this.slot, action)
      : executeDirectedAgenticaAction(this.slot, action);
  }
  async wake(event: DirectedHostEvent) {
    if (!this.binding || event.kind !== 'decision') throw new Error('A retained semantic decision is required.');
    const draft = { ...this.binding, parentOperationId: event.operationId };
    this.ready = deferred<void>();
    try {
      const started = await this.sdk.wakeOperation(event);
      await this.bind(draft, started);
      this.ready.resolve();
      return this.binding!;
    } catch (error) {
      this.ready.reject(error instanceof Error ? error : new Error('Semantic wake is unresolved.'));
      throw error;
    }
  }
  async recover(runId: string): Promise<AgenticaOperationEntry | undefined> {
    const binding = await loadDirectedAgenticaRun(this.slot, runId);
    if (!binding) throw new Error('Original directed run is not retained.');
    this.binding = binding;
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
  close() { this.closed = true; this.sdk.close(); }
}

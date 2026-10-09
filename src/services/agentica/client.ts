import { bindAgenticaRun, executeAgenticaAction, loadAgenticaAction, loadAgenticaRun,
  reconcileAgenticaAction, saveAgenticaAction } from '../../persistence/agenticaRepository';
import { claimStreamControl, loadStreamControl, loadStreamSnapshot } from '../../persistence/streamRepository';
import { ensureStreamPublicScope, getStreamPublicScope } from '../../persistence/streamPublicScope';
import type { StreamControl } from '../../domain/expedition/streaming/types';
import type { AgenticaAction, AgenticaActionRecord, AgenticaGameBinding, AgenticaObjective, AgenticaResult, AgenticaStart } from './contracts';
import { mazeCapabilities } from './capabilities';
import { parseAgenticaCommand, validateAgenticaBinding } from './commands';
import { createAgenticaObservation } from './observation';
import { checkRecord, deferred, fixtureUrl, keyIdentity, objectiveIdentity, startedBinding } from './clientPolicy';
import { AgenticaHost, canonicalJson, type AgenticaMessage, type AgenticaStarted } from './sdk/agentica-host.mjs';

export interface AgenticaClientOptions {
  slot: string; url: string; objective: AgenticaObjective;
  onMessage?(message: AgenticaMessage): void;
  onStatus?(status: { state: string; detail?: unknown }): void;
}

/** One bounded fixture run per client. Reconnection never creates another attempt or claims control. */
export function openAgenticaClient(options: AgenticaClientOptions) { return new AgenticaClient(options); }

export class AgenticaClient {
  private readonly options: AgenticaClientOptions;
  private readonly sdk: AgenticaHost;
  private readonly ready = deferred<AgenticaGameBinding>();
  private binding?: AgenticaGameBinding;
  private draft?: AgenticaGameBinding;
  private owner?: StreamControl;
  private claiming?: Promise<StreamControl>;
  private releasing?: Promise<void>;
  private starting?: Promise<AgenticaGameBinding>;
  private reconnecting?: Promise<AgenticaMessage>;
  private resumeGate?: Promise<void>;
  private cancelling?: Promise<void>;
  private closing?: Promise<void>;
  private stopping?: Promise<void>;
  private admitting = true;
  private cancelled = false;
  private closed = false;
  private bindingPending = false;
  private announcedRun?: string;
  private announcedBinding?: AgenticaGameBinding;
  private terminal?: string;
  private state = 'idle';

  constructor(options: AgenticaClientOptions) {
    if (typeof options.slot !== 'string' || !options.slot.trim() || options.slot.length > 128
      || !['first-chest', 'explore-collect-return'].includes(options.objective)) throw new Error('Invalid Agentica client scope or objective.');
    this.options = { ...options, url: fixtureUrl(options.url) };
    this.sdk = new AgenticaHost({ url: this.options.url, maxMessages: 128, maxActions: 2048, maxQueuedActions: 8,
      loadAction: key => this.boundary(this.load(key)), saveAction: (key, record) => this.boundary(this.save(key, record)),
      onAction: action => this.execute(action), reconcileAction: action => this.boundary(this.reconcile(action)),
      onMessage: message => this.message(message), onStatus: status => {
        if (this.closed) return;
        try { this.options.onStatus?.(status); } catch { /* Observers cannot change custody. */ }
      },
    });
  }
  get currentRun() { return this.binding && structuredClone(this.binding); }
  get status() { return this.state; }
  get connected() { return this.sdk.connected; }
  private statusChanged(state: string) {
    this.state = state;
    try { this.options.onStatus?.({ state }); } catch { /* Observers cannot change custody. */ }
  }
  private requireOpen() {
    if (!this.admitting || this.closed) throw new Error('Agentica client no longer admits effects.');
  }
  private async boundary<T>(operation: Promise<T>): Promise<T> {
    try { return await operation; } catch { throw new Error('Agentica durable action evidence is unavailable or invalid.'); }
  }
  private owns(control: StreamControl | undefined, owner = this.owner) {
    return !!control && !!owner && control.sessionId === owner.sessionId && control.epoch === owner.epoch;
  }

  start(): Promise<AgenticaGameBinding> {
    if (this.starting) return this.starting.then(binding => structuredClone(binding));
    if (this.binding) return Promise.resolve(structuredClone(this.binding));
    this.bindingPending = true;
    this.starting = Promise.resolve().then(() => this.begin());
    return this.starting.then(binding => structuredClone(binding));
  }
  private async begin() {
    try {
      this.requireOpen(); this.statusChanged('starting');
      this.requireOpen(); await this.sdk.connect(); this.requireOpen();
      const scopeId = await ensureStreamPublicScope(this.options.slot); this.requireOpen();
      const before = await loadStreamControl(this.options.slot); this.requireOpen();
      this.claiming = claimStreamControl(this.options.slot, crypto.randomUUID(), before?.epoch ?? null);
      this.owner = await this.claiming; this.requireOpen();
      const snapshot = await loadStreamSnapshot(this.options.slot); this.requireOpen();
      // These two placeholders are projection-only; no provisional run is persisted or sent as a binding.
      this.draft = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, sessionEpoch: String(this.owner.epoch),
        scopeId, perspectiveId: 'party', worldId: snapshot.checkpoint.worldId, floorId: snapshot.checkpoint.floorId,
        objectiveId: objectiveIdentity(scopeId, this.options.objective), objective: this.options.objective,
        runId: 'pending-start', manifestHash: `sha256:${'0'.repeat(64)}`, control: { ...this.owner } };
      const request: AgenticaStart = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, sessionEpoch: this.draft.sessionEpoch,
        scopeId, perspectiveId: 'party', objectiveId: this.draft.objectiveId, objective: this.options.objective,
        observation: createAgenticaObservation(snapshot, this.draft), capabilities: mazeCapabilities(),
        provider: { provider: 'fixture', model: 'fixture-model', contextWindowTokens: 131072, maxOutputTokens: 4096 },
        limits: { maxSteps: 128, maxRefinements: 128, maxPlanContinuations: 64, timeoutSeconds: 900, actionTimeoutSeconds: 45 } };
      const started = await this.sdk.start(request);
      const binding = startedBinding(this.draft, started);
      if (!this.announcedBinding || canonicalJson(this.announcedBinding) !== canonicalJson(binding)) throw new Error('Expected a matching started envelope.');
      this.announcedRun = binding.runId;
      if (!this.terminal || this.cancelled || this.closed) this.requireOpen();
      if (!this.terminal) this.statusChanged('binding');
      await bindAgenticaRun(this.options.slot, structuredClone(binding));
      this.binding = binding;
      if (!this.terminal || this.cancelled || this.closed) this.requireOpen();
      this.ready.resolve(binding);
      if (this.terminal) await this.releaseOwner();
      else this.statusChanged(this.sdk.connected ? 'ready' : 'disconnected');
      return structuredClone(binding);
    } catch {
      this.admitting = false;
      this.ready.reject(new Error('Agentica run binding was not established.'));
      await this.releaseOwner().catch(() => undefined);
      await this.stopRun().catch(() => undefined);
      if (!this.closed && !this.terminal && this.state !== 'cancelled') this.statusChanged('unresolved');
      throw new Error('Agentica start failed; reconcile the original session before another run.');
    } finally { this.bindingPending = false; }
  }

  private async forKey(key: string) {
    const [sessionId, sessionEpoch, runId] = keyIdentity(key);
    if (this.bindingPending) await this.ready.promise;
    if (this.resumeGate) await this.resumeGate;
    const binding = await loadAgenticaRun(this.options.slot, runId);
    if (!binding) throw new Error('Agentica action has no durable run binding.');
    validateAgenticaBinding(binding);
    if (binding.sessionId !== sessionId || binding.sessionEpoch !== sessionEpoch || binding.runId !== runId) throw new Error('Agentica action key binding mismatch.');
    return binding;
  }
  private async load(key: string) {
    await this.forKey(key);
    return await loadAgenticaAction(this.options.slot, key) ?? null;
  }
  private async save(key: string, record: AgenticaActionRecord) {
    const fixed = structuredClone(record);
    const binding = await this.forKey(key);
    checkRecord(key, fixed, binding);
    await saveAgenticaAction(this.options.slot, key, fixed);
  }
  private unresolved(action: AgenticaAction): AgenticaResult {
    return { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
      disposition: 'unresolved', beforeRevision: action.expectedRevision, afterRevision: action.expectedRevision,
      evidenceId: `unresolved:${action.actionId}`, summary: 'Original action outcome requires reconciliation; no replacement attempt was made.' };
  }
  private async execute(action: AgenticaAction): Promise<AgenticaResult> {
    try {
      const binding = await this.ready.promise;
      parseAgenticaCommand(action, binding);
      const original = await reconcileAgenticaAction(this.options.slot, structuredClone(action));
      if (original && original.disposition !== 'unresolved') return original;
      this.requireOpen();
      if (!this.sdk.connected || !this.owns(await loadStreamControl(this.options.slot), binding.control)) throw new Error('Control changed.');
      this.requireOpen();
      if (!this.sdk.connected || Date.parse(action.deadlineAt) <= Date.now()) throw new Error('Host disconnected or action expired.');
      const result = await executeAgenticaAction(this.options.slot, structuredClone(action));
      if (result.disposition === 'conflict' || result.disposition === 'unresolved') {
        this.admitting = false;
        if (!this.closed && !this.terminal && !this.cancelled) this.statusChanged('unresolved');
      }
      return result;
    } catch {
      this.admitting = false;
      if (!this.closed && !this.terminal && this.state !== 'cancelled') this.statusChanged('unresolved');
      return await reconcileAgenticaAction(this.options.slot, structuredClone(action)).catch(() => undefined) ?? this.unresolved(action);
    }
  }

  private message(message: AgenticaMessage) {
    if (message.type === 'started' && this.draft) {
      try {
        const binding = startedBinding(this.draft, message.payload as AgenticaStarted);
        if (message.runId !== undefined && message.runId !== binding.runId) throw new Error('Run identity changed.');
        this.announcedBinding = binding; this.announcedRun = binding.runId;
      } catch { /* The correlated start rejects mismatched bindings. */ }
    }
    const runId = this.binding?.runId ?? this.announcedRun;
    if (runId && ['outcome', 'run.terminated', 'cancelled', 'cancel.requested'].includes(message.type) && message.runId === runId) {
      this.admitting = false;
      this.terminal = message.type;
      if (!this.closed) this.statusChanged(message.type);
      if (!this.bindingPending) void this.releaseOwner().catch(() => { if (!this.closed) this.statusChanged('release.failed'); });
    }
    if (!this.closed) try { this.options.onMessage?.(structuredClone(message)); } catch { /* Display cannot authorize actions. */ }
  }
  private releaseOwner(): Promise<void> {
    return this.releasing ??= Promise.resolve().then(async () => {
      const owner = this.owner ?? await this.claiming;
      if (!owner) return;
      const current = await loadStreamControl(this.options.slot);
      if (this.owns(current, owner)) await claimStreamControl(this.options.slot, owner.sessionId, owner.epoch);
    }).catch(error => { this.releasing = undefined; throw error; });
  }
  private stopRun(): Promise<void> {
    const runId = this.binding?.runId ?? this.announcedRun;
    if (!runId || this.closed) return Promise.resolve();
    return this.stopping ??= this.sdk.stop(runId).then(() => undefined);
  }
  cancel(): Promise<void> {
    if (this.closed) return this.close();
    this.admitting = false; this.cancelled = true;
    this.ready.reject(new Error('Agentica client cancelled.'));
    return this.cancelling ??= Promise.resolve().then(async () => {
      this.statusChanged('cancelling');
      let failed = false;
      await this.releaseOwner().catch(() => { failed = true; });
      await this.stopRun().catch(() => { failed = true; });
      if (!this.closed) this.statusChanged(failed ? 'unresolved' : 'cancelled');
      if (failed) throw new Error('Agentica cancellation requires reconciliation.');
    }).catch(error => { this.cancelling = undefined; throw error; });
  }
  close(): Promise<void> {
    this.admitting = false; this.closed = true;
    this.ready.reject(new Error('Agentica client closed.'));
    return this.closing ??= Promise.resolve().then(async () => {
      this.sdk.close(); this.statusChanged('closed');
      await this.releaseOwner();
    }).catch(error => { this.closing = undefined; throw error; });
  }

  reconnect(runId = this.binding?.runId): Promise<AgenticaMessage> {
    if (this.closed || !runId || this.bindingPending || (this.cancelled && !this.binding)) return Promise.reject(new Error('A retained run is required for reconnect.'));
    if (this.reconnecting) return this.reconnecting;
    if (!this.owner) this.releasing = undefined;
    const gate = deferred<void>(); this.resumeGate = gate.promise;
    const cancelled = this.cancelled;
    this.reconnecting = (async () => {
      const loading = (async () => {
        const binding = await loadAgenticaRun(this.options.slot, runId);
        if (!binding) throw new Error('Agentica run is not durably bound.');
        validateAgenticaBinding(binding);
        if (binding.objective !== this.options.objective || binding.scopeId !== await getStreamPublicScope(this.options.slot)
          || (this.binding && canonicalJson(this.binding) !== canonicalJson(binding))) throw new Error('Agentica reconnect binding changed.');
        return binding;
      })();
      this.claiming = loading.then(binding => binding.control); void this.claiming.catch(() => undefined);
      const binding = await loading;
      this.binding = structuredClone(binding); this.owner = { ...binding.control };
      if (!this.owns(await loadStreamControl(this.options.slot))) this.admitting = false;
      if (this.closed || this.cancelled !== cancelled) throw new Error('Reconnect interrupted.');
      this.statusChanged('reconnecting');
      const response = await this.sdk.resume({ runId, sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch });
      if (this.closed || this.cancelled !== cancelled || response.type !== 'resumed'
        || (response.runId !== undefined && response.runId !== runId)
        || canonicalJson(startedBinding(binding, response.payload as AgenticaStarted)) !== canonicalJson(binding)) throw new Error('Agentica resume binding changed.');
      this.ready.resolve(binding); gate.resolve();
      if (this.admitting && !this.closed) this.statusChanged(this.sdk.connected ? 'ready' : 'disconnected');
      return response;
    })().catch(() => {
      this.admitting = false; gate.reject(new Error('Agentica resume binding was not established.'));
      if (!this.closed && !this.cancelled) this.statusChanged('unresolved');
      throw new Error('Agentica reconnect failed; reconcile original actions.');
    }).finally(() => { this.reconnecting = undefined; this.resumeGate = undefined; });
    return this.reconnecting;
  }
  async reconcile(action: AgenticaAction): Promise<AgenticaResult | undefined>;
  async reconcile(): Promise<{ actionId: string; runId: string; sessionEpoch: string; status: string; resolved: boolean }[]>;
  async reconcile(action?: AgenticaAction) {
    if (action) {
      const fixed = structuredClone(action);
      const binding = await loadAgenticaRun(this.options.slot, fixed.runId);
      if (!binding) throw new Error('Agentica action has no retained run.');
      parseAgenticaCommand(fixed, binding);
      return await reconcileAgenticaAction(this.options.slot, fixed) ?? undefined;
    }
    const sessionId = await getStreamPublicScope(this.options.slot);
    if (!sessionId) throw new Error('Agentica scope has not been bound.');
    return this.sdk.recover({ hostId: 'maze-battle', sessionId });
  }
}

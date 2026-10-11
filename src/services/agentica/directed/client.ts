import type { CellAddress } from '../../../domain/expedition/types';
import type { StreamControl } from '../../../domain/expedition/streaming/types';
import type { StoredDirectedStreamOperation } from '../../../persistence/directedStreamTypes';
import { ensureStreamPublicScope, readStreamKnowledge, loadStreamSnapshot, claimStreamControl, loadStreamControl } from '../../../persistence/streamRepository';
import { openDirectedStreamSession, loadDirectedStreamSession, prepareDurableDirectedStreamMove,
  executeDurableDirectedStreamMove, stopDurableDirectedStreamTravel } from '../../../persistence/directedStreamRepository';
import { readDirectedHostOperation, stageDirectedHostEvent, acknowledgeDirectedHostEvent } from '../../../persistence/directedAgentica/events';
import { adoptDirectedAgenticaOperation, cancelDirectedAgenticaOperation } from '../../../persistence/directedAgentica/control';
import { DirectedAgenticaTransport } from './transport';
import { directedCapabilities } from './capabilities';
import { directedObservation } from './observation';
import type { DirectedAgenticaBinding } from './contracts';
import type { DirectedHostEvent } from '../../../persistence/directedAgentica/types';
import { addressKey, sameAddress } from '../../../domain/expedition/address';
import type { AgenticaMessage } from '../sdk/agentica-host.mjs';
import { equivalentHostWire } from './wire';

export interface DirectedAgenticaOptions {
  slot: string; url: string; destination: CellAddress; objective?: string;
  inspectOnArrival?: boolean;
  onMessage?(message: AgenticaMessage): void;
}

/** Agent chooses a destination; the browser executes travel without per-cell cognition. */
export class DirectedAgenticaClient {
  private readonly transport: DirectedAgenticaTransport;
  private owner?: StreamControl;
  private operationId?: string;
  private active?: Promise<unknown>;
  private enabled = false;
  private closed = false;
  private cancelled = false;
  private closing?: Promise<void>;
  private cancelling?: Promise<StoredDirectedStreamOperation | undefined>;
  private state = 'idle';
  private parked = false;
  private readonly options: DirectedAgenticaOptions;
  constructor(options: DirectedAgenticaOptions) {
    this.options = structuredClone({ ...options, onMessage: undefined });
    this.transport = new DirectedAgenticaTransport(options.slot, options.url, message => {
      if (message.type === 'operation.parked') this.state = 'parked';
      try { options.onMessage?.(message); } catch { /* Observers have no authority. */ }
    });
  }
  get currentRun() { return structuredClone(this.transport.binding); }
  get status() { return this.state; }
  get connected() { return this.transport.sdk.connected; }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.active) return Promise.reject(new Error('Directed host transition already in progress.'));
    if (this.closed) return Promise.reject(new Error('Directed host is closed.'));
    const promise = work(); this.active = promise;
    void promise.finally(() => { if (this.active === promise) this.active = undefined; }).catch(() => undefined);
    return promise;
  }
  start() { return this.exclusive(async () => {
    const currentStart = () => { if (this.cancelled || this.closed) throw new Error('Directed start was cancelled.'); };
    currentStart();
    if (this.transport.binding) return this.currentRun!;
    const known = await readStreamKnowledge(this.options.slot, this.options.destination.spaceId);
    currentStart();
    if (!known?.cells[addressKey(this.options.destination)]) throw new Error('Destination has not been observed.');
    const current = await loadDirectedStreamSession(this.options.slot);
    currentStart();
    if (current.record && ['running', 'interrupted'].includes(current.record.state.operation.status)) {
      const prior = await readDirectedHostOperation(this.options.slot, current.record.state.operation.id);
      if (current.record.state.operation.status === 'running' || prior.link.sequence !== prior.link.acknowledged
        || !prior.event || !['blocked', 'cancelled', 'completed'].includes(prior.event.kind)) {
        throw new Error('Reconcile, explicitly adopt, or cancel the retained intention before a new objective.');
      }
    }
    const scopeId = await ensureStreamPublicScope(this.options.slot);
    currentStart();
    const session = await openDirectedStreamSession(this.options.slot, crypto.randomUUID());
    this.owner = session.control;
    currentStart();
    const snapshot = await loadStreamSnapshot(this.options.slot);
    currentStart();
    const draft: DirectedAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId,
      scopeId, sessionEpoch: String(this.owner.epoch), perspectiveId: 'party', worldId: snapshot.checkpoint.worldId,
      floorId: snapshot.checkpoint.floorId, objectiveId: crypto.randomUUID(),
      objective: this.options.objective ?? (this.options.inspectOnArrival
        ? 'Travel to the designated known destination, then explicitly inspect its actor-known evidence.'
        : 'Travel to the designated known destination without interacting with anything.'),
      ...(this.options.inspectOnArrival ? { arrivalPolicy: 'inspect' as const } : {}),
      destination: this.options.destination, runId: 'pending-start', manifestHash: `sha256:${'0'.repeat(64)}`, control: this.owner };
    this.state = 'starting';
    const binding = await this.transport.start(draft, { protocolVersion: 1,
      hostId: draft.hostId, sessionId: draft.sessionId, sessionEpoch: draft.sessionEpoch, scopeId, perspectiveId: 'party',
      objectiveId: draft.objectiveId, objective: draft.objective, observation: directedObservation(snapshot, draft),
      capabilities: directedCapabilities(), provider: { provider: 'fixture', model: 'fixture-model', contextWindowTokens: 131072, maxOutputTokens: 4096 },
      limits: { maxSteps: 16, maxRefinements: 8, maxPlanContinuations: 8, timeoutSeconds: 300, actionTimeoutSeconds: 45 } });
    currentStart();
    this.enabled = true;
    return binding;
  }); }
  private async retained() {
    const session = await loadDirectedStreamSession(this.options.slot, this.operationId);
    if (!session.record) return undefined;
    const id = session.record.state.operation.id;
    const retained = await readDirectedHostOperation(this.options.slot, id);
    if (retained.link.binding.runId !== this.transport.binding?.runId
      && this.transport.binding?.parentOperationId !== id) throw new Error('Journey belongs to another original run.');
    this.operationId = id;
    return { session, ...retained };
  }
  private async confirmAdmission() {
    if (this.parked) return;
    const binding = this.transport.binding;
    if (!binding) throw new Error('No bound Agentica run.');
    const entries = await this.transport.sdk.listOperations({ hostId: binding.hostId, sessionId: binding.sessionId });
    const entry = entries.find(value => value.action.runId === binding.runId && value.admission?.operation?.operationId === this.operationId);
    if (!entry || entry.state !== 'parked') throw new Error('Original service admission is not parked and settled.');
    this.parked = true;
  }
  private async deliver(event: DirectedHostEvent) {
    if (event.kind === 'decision') {
      this.enabled = false;
      await this.transport.wake(event);
      await acknowledgeDirectedHostEvent(this.options.slot, event);
      this.state = 'awaiting-inspection';
      return;
    }
    const receipt = await this.transport.sdk.signalOperation(event, { fetchImpl: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) });
    if (!equivalentHostWire(receipt.latestEvent, event, 'event')) throw new Error('Operation acknowledgement does not match original event.');
    await acknowledgeDirectedHostEvent(this.options.slot, event);
    this.state = event.kind === 'progress' || event.kind === 'transfer' ? 'parked' : event.kind;
  }
  /** One scheduled browser step. Calls serialize and never trigger the model. */
  tick() { return this.exclusive(async (): Promise<StoredDirectedStreamOperation | undefined> => {
    const retained = await this.retained();
    if (!retained) return undefined;
    const { link, event } = retained;
    let record = retained.session.record!;
    if (event?.kind === 'decision' && link.sequence === link.acknowledged && !this.cancelled) {
      const binding = this.transport.binding!;
      const entries = await this.transport.sdk.listOperations({ hostId: binding.hostId, sessionId: binding.sessionId });
      const entry = entries.find(value => value.admission?.operation?.operationId === link.operationId);
      if (entry?.wakeRunId === binding.runId && ['completed', 'blocked', 'cancelled'].includes(entry.state)) this.state = entry.state;
      return record;
    }
    if (event && link.sequence === link.acknowledged && ['completed', 'blocked', 'cancelled', 'decision'].includes(event.kind)) return record;
    await this.confirmAdmission();
    if (event && link.sequence !== link.acknowledged) { await this.deliver(event); return record; }
    if (event && ['completed', 'blocked', 'cancelled', 'decision'].includes(event.kind)) return record;
    if (record.state.operation.status === 'cancelled') {
      await this.deliver(await stageDirectedHostEvent(this.options.slot, link.operationId)); return record;
    }
    if (record.state.operation.status === 'arrived') {
      await this.deliver(await stageDirectedHostEvent(this.options.slot, link.operationId)); return record;
    }
    if (!this.enabled || !this.owner) { this.state = 'awaiting-adoption'; return record; }
    if (record.state.paused) { this.state = 'awaiting-adoption'; return record; }
    if (record.state.operation.status === 'running') {
      record = await prepareDurableDirectedStreamMove(this.options.slot, this.owner,
        { operationId: link.operationId, revision: record.revision, actionId: crypto.randomUUID() });
      if (!this.enabled || this.closed) return record;
      if (record.state.pending) record = await executeDurableDirectedStreamMove(this.options.slot, this.owner,
        { operationId: link.operationId, actionId: record.state.pending.request.actionId });
    }
    await this.deliver(await stageDirectedHostEvent(this.options.slot, link.operationId));
    return record;
  }); }
  recover(runId: string) { return this.exclusive(async () => {
    this.enabled = false; this.state = 'reconciling';
    const entry = await this.transport.recover(runId);
    const binding = this.transport.binding!;
    if (!sameAddress(binding.destination, this.options.destination)) throw new Error('Recovery destination changed.');
    this.operationId = entry?.admission?.operation?.operationId;
    const retained = await this.retained();
    if (!retained) throw new Error('No original admitted journey to recover.');
    this.parked = entry?.state === 'parked';
    if (retained.event && retained.link.sequence !== retained.link.acknowledged) await this.deliver(retained.event);
    if (retained.session.record?.state.operation.status === 'cancelled' && retained.event?.kind !== 'cancelled') {
      await this.deliver(await stageDirectedHostEvent(this.options.slot, retained.link.operationId));
      return this.currentRun;
    }
    this.state = entry && ['completed', 'blocked', 'cancelled'].includes(entry.state) ? entry.state
      : retained.event && ['completed', 'blocked', 'cancelled'].includes(retained.event.kind)
      ? retained.event.kind : 'awaiting-adoption';
    return this.currentRun;
  }); }
  adopt() { return this.exclusive(async () => {
    if (this.cancelled) throw new Error('Cancelled host cannot adopt a journey.');
    const retained = await this.retained();
    if (!retained) throw new Error('No retained journey to adopt.');
    await this.confirmAdmission();
    if (retained.event && retained.link.sequence !== retained.link.acknowledged) {
      await this.deliver(retained.event);
      if (retained.event.kind === 'transfer' && this.owner?.epoch === Number(retained.event.nextSessionEpoch)) {
        this.enabled = !this.closed && !this.cancelled; return retained.session.record;
      }
    }
    this.enabled = false;
    const session = await openDirectedStreamSession(this.options.slot, crypto.randomUUID());
    this.owner = session.control;
    const event = await adoptDirectedAgenticaOperation(this.options.slot, retained.link.operationId, this.owner);
    await this.deliver(event);
    this.enabled = !this.closed && !this.cancelled;
    return (await loadDirectedStreamSession(this.options.slot)).record;
  }); }
  async cancel() {
    this.enabled = false; this.cancelled = true;
    return this.cancelling ??= (async () => {
      const retained = await this.retained();
      if (!retained) {
        const current = await loadStreamControl(this.options.slot);
        if (this.owner && current?.sessionId === this.owner.sessionId && current.epoch === this.owner.epoch) {
          await claimStreamControl(this.options.slot, this.owner.sessionId, this.owner.epoch);
        }
        this.state = 'cancelled';
        if (this.transport.binding) await this.transport.sdk.stop(this.transport.binding.runId);
        return undefined;
      }
      if (!this.owner) {
        const session = await openDirectedStreamSession(this.options.slot, crypto.randomUUID());
        this.owner = session.control;
      }
      const event = await cancelDirectedAgenticaOperation(this.options.slot, retained.link.operationId, this.owner);
      this.state = 'cancelled';
      if (event) await this.deliver(event);
      else if (retained.event?.kind === 'decision' && this.transport.binding) {
        await this.transport.sdk.stop(this.transport.binding.runId);
      }
      // No network success is needed to fence local movement. A pending original
      // progress event remains available for exact reconciliation on recovery.
      return (await loadDirectedStreamSession(this.options.slot)).record;
    })().finally(() => { this.cancelling = undefined; });
  }
  close(): Promise<void> {
    this.enabled = false; this.closed = true; this.transport.close();
    return this.closing ??= (async () => {
      const retained = await this.retained();
      if (retained && this.owner && ['running', 'interrupted'].includes(retained.session.record!.state.operation.status)) {
        const current = await loadStreamControl(this.options.slot);
        if (current?.sessionId === this.owner.sessionId && current.epoch === this.owner.epoch) {
          await stopDurableDirectedStreamTravel(this.options.slot, this.owner, retained.link.operationId, 'pause');
        }
      }
    })();
  }
}

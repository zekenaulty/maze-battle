import { streamActionSignature } from '../../../persistence/streamValidation';
import type { StreamActionRequest, StreamActionResult } from '../../../domain/expedition/streaming/types';
import { PLANNING_PROTOCOL, type HostBody, type HostMessage, type PlanningBinding, type PlanningHost, type PlanningLimits, type PlanningOutcome, type PlanningProgress, type PlanningState } from './contracts';
import { actionRequest, parseServiceMessage, sameBinding, validateBinding, validateLimits } from './protocol';
import { projectPlanningFrame } from './projection';

/** Browser-owned gate. No provider code, timers, or partial proposals execute here. */
export class PlanningSession {
  private readonly binding: PlanningBinding;
  private readonly limits: PlanningLimits;
  private readonly started: number;
  private privateScope?: string;
  private closed = false;
  private attempts = 0;
  private active?: { signature: string; promise: Promise<HostMessage> };
  private progressSequence = -1;
  private dropped = 0;
  private progress: PlanningProgress[] = [];
  private readonly host: PlanningHost;
  private readonly now: () => number;

  constructor(host: PlanningHost, binding: PlanningBinding, limits: PlanningLimits, now = () => performance.now()) {
    validateBinding(binding); validateLimits(limits);
    this.host = host; this.now = now;
    this.binding = structuredClone(binding); this.limits = { ...limits }; this.started = now();
  }
  get diagnostics() { return { attempts: this.attempts, active: !!this.active, closed: this.closed, dropped: this.dropped, progress: structuredClone(this.progress) }; }
  private message(body: HostBody): HostMessage {
    return { protocol: PLANNING_PROTOCOL, binding: structuredClone(this.binding), ...body };
  }
  private error(reason: string) { return this.message({ type: 'error', reason }); }
  private owns(state: PlanningState) {
    return state.control?.sessionId === this.binding.sessionId && state.control.epoch === this.binding.epoch
      && state.checkpoint.worldId === this.binding.worldId && state.checkpoint.floorId === this.binding.floorId
      && (this.privateScope === undefined || state.checkpoint.scopeId === this.privateScope);
  }
  private frame(state: PlanningState) { return projectPlanningFrame(state, this.binding, this.limits.frameBytes); }
  private withinBudget() { return this.attempts < this.limits.actions && this.now() - this.started < this.limits.elapsedMs; }

  async start(): Promise<HostMessage> {
    const state = await this.host.read();
    if (this.closed || !this.owns(state) || !this.withinBudget()) return this.error('Session cannot start.');
    this.privateScope = state.checkpoint.scopeId;
    return this.message({ type: 'start', limits: { ...this.limits }, objective: 'explore-collect-return',
      capabilities: ['observe', 'move', 'collect', 'prepare', 'finish', 'action.query'], frame: this.frame(state) });
  }

  async handle(text: string): Promise<HostMessage> {
    try {
      const input = parseServiceMessage(text);
      if (!sameBinding(input.binding, this.binding) || this.privateScope === undefined) return this.error('Session binding mismatch.');
      if (input.type === 'action.query') {
        const receipt = await this.host.lookup(actionRequest(input));
        return receipt ? await this.result(receipt.result) : this.message({ type: 'action.unresolved', actionId: input.actionId, reason: 'No committed result. Do not infer that an in-flight action had no effect.' });
      }
      if (input.type === 'action.request') {
        const request = actionRequest(input);
        const signature = streamActionSignature(request);
        if (this.active) return signature === this.active.signature ? structuredClone(await this.active.promise) : this.error('An action is already in flight.');
        const promise = this.execute(request);
        this.active = { signature, promise };
        try { return structuredClone(await promise); } finally { this.active = undefined; }
      }
      if (this.closed) return this.error('Session is closed.');
      if (input.type === 'observe') {
        const state = await this.host.read();
        if (this.closed || !this.owns(state) || !this.withinBudget()) return this.error('Observation session expired.');
        return this.message({ type: 'observation', frame: this.frame(state) });
      }
      if (input.type === 'progress') return this.recordProgress(input);
      if (input.type === 'outcome') return await this.outcome(input);
      return this.error('Unsupported message.');
    } catch { return this.error('Invalid or unavailable planning request.'); }
  }

  private async execute(request: StreamActionRequest): Promise<HostMessage> {
    const original = await this.host.lookup(request);
    if (original) return this.result(original.result); // Original evidence survives expiry and takeover.
    if (this.closed || !this.withinBudget()) return this.error('Session stopped or run budget exhausted.');
    const state = await this.host.read();
    if (!this.owns(state)) { this.closed = true; return this.error('Control ownership changed.'); }
    this.frame(state); // Refuse before effects if the current evidence cannot fit the agreed frame.
    if (this.closed || !this.withinBudget()) return this.error('Session stopped or run budget exhausted.');
    this.attempts++;
    try { return await this.result(await this.host.execute(request)); }
    catch {
      // Preserve the exact attempt when acknowledgement or storage reads fail.
      const receipt = await this.host.lookup(request).catch(() => undefined);
      if (receipt) return this.result(receipt.result);
      this.closed = true;
      return this.message({ type: 'action.unresolved', actionId: request.actionId, reason: 'Original result unavailable. Reconcile this action before another run.' });
    }
  }
  private async result(value: StreamActionResult): Promise<HostMessage> {
    const result: StreamActionResult = { actionId: value.actionId, disposition: value.disposition, beforeRevision: value.beforeRevision,
      afterRevision: value.afterRevision, topologyRevision: value.topologyRevision, reason: value.reason };
    if (result.disposition === 'conflict') this.closed = true;
    // A current frame is separate evidence, not an assertion that replay just applied.
    const state = !this.closed && await this.host.read().catch(() => undefined);
    const frame = !this.closed && state && this.owns(state) ? this.frame(state) : undefined;
    return this.message({ type: 'action.result', result, ...(frame ? { frame } : {}) });
  }
  private recordProgress(input: PlanningProgress) {
    if (input.sequence > this.progressSequence) {
      this.dropped += input.sequence - this.progressSequence - 1;
      this.progressSequence = input.sequence;
      this.progress.push(input);
      if (this.progress.length > 16) { this.progress.shift(); this.dropped++; }
    }
    return this.message({ type: 'progress.ack', sequence: this.progressSequence, dropped: this.dropped });
  }
  private async outcome(input: PlanningOutcome) {
    if (this.active) return this.error('Wait for the original action result.');
    if (input.status === 'complete') {
      if (!input.resultActionId) return this.error('Completion requires a committed finish result.');
      const state = await this.host.read();
      const request: StreamActionRequest = { version: 2, sessionId: this.binding.sessionId, epoch: this.binding.epoch,
        actionId: input.resultActionId, expectedRevision: state.checkpoint.revision - 1,
        expectedTopologyRevision: state.checkpoint.topologyRevision, command: { type: 'finish' } };
      const receipt = await this.host.lookup(request);
      if (this.closed || !this.owns(state) || state.checkpoint.phase !== 'complete' || receipt?.result.disposition !== 'applied'
        || receipt.result.afterRevision !== state.checkpoint.revision) return this.error('Completion is not evidenced by the game.');
    }
    this.closed = true;
    return this.message({ type: 'outcome', status: input.status, summary: input.summary, ...(input.resultActionId ? { resultActionId: input.resultActionId } : {}) });
  }
  async cancel() {
    this.closed = true;
    // An already dispatched action may settle. This fences every later effect.
    await this.host.release();
    return this.message({ type: 'outcome', status: 'cancelled', summary: 'Browser control reclaimed. Reconcile any outstanding action.' });
  }
}

import { SpaceResidency } from '../../../domain/expedition/residency';
import { materializeSpace } from '../../../domain/expedition/schematic';
import type { StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { pauseDirectedStreamTravel } from '../../../domain/expedition/streaming/directed/execution';
import type { DirectedStreamSession, StoredDirectedStreamOperation } from '../../../persistence/directedStreamTypes';
import { executeDurableDirectedStreamMove, loadDirectedStreamSession, openDirectedStreamSession,
  prepareDurableDirectedStreamMove, startDurableDirectedStreamTravel, stopDurableDirectedStreamTravel } from '../../../persistence/directedStreamRepository';

/** One explicit intention, one admitted move at a time; no automatic objective policy. */
export class DirectedStreamExecutor {
  private readonly slot: string;
  private session: DirectedStreamSession;
  private readonly cache = new SpaceResidency(512, materializeSpace);
  private active?: Promise<StoredDirectedStreamOperation | undefined>;
  private generation = 0;
  private stopping = false;

  private constructor(slot: string, session: DirectedStreamSession) { this.slot = slot; this.session = session; }
  static async open(slot: string, sessionId = crypto.randomUUID()) {
    return new DirectedStreamExecutor(slot, await openDirectedStreamSession(slot, sessionId));
  }
  get record() { return structuredClone(this.session.record); }
  get control() { return { ...this.session.control }; }
  get residency() { return this.cache.stats(); }

  async navigate(target: StreamDestination, operationId = crypto.randomUUID()) {
    if (this.active || this.stopping) throw new Error('Directed execution is busy.');
    const generation = this.generation;
    const work = startDurableDirectedStreamTravel(this.slot, this.session.control, { id: operationId, target });
    this.active = work;
    try {
      const record = await work;
      if (generation === this.generation) this.session.record = record;
      return structuredClone(record);
    } finally { if (this.active === work) this.active = undefined; }
  }

  step(): Promise<StoredDirectedStreamOperation | undefined> {
    if (this.active) return this.active;
    const record = this.session.record;
    if (this.stopping || !record || record.state.paused || record.state.operation.status !== 'running') return Promise.resolve(this.record);
    const generation = this.generation;
    const work = this.advance(record, generation);
    this.active = work;
    void work.finally(() => { if (this.active === work) this.active = undefined; }).catch(() => undefined);
    return work;
  }

  private async advance(previous: StoredDirectedStreamOperation, generation: number) {
    const operationId = previous.state.operation.id;
    const control = { ...this.session.control };
    try {
      let record = await prepareDurableDirectedStreamMove(this.slot, control,
        { operationId, revision: previous.revision, actionId: crypto.randomUUID() });
      if (generation !== this.generation) return this.record;
      if (record.state.pending) record = await executeDurableDirectedStreamMove(this.slot, control,
        { operationId, actionId: record.state.pending.request.actionId }, space => this.cache.get(space.spec));
      if (generation === this.generation) {
        this.session.record = record;
        this.session.checkpoint = structuredClone(record.state.frame.checkpoint);
      }
      return structuredClone(record);
    } catch (error) {
      if (generation === this.generation) {
        // This barrier reconciles the saved original request and revokes its
        // epoch. It never substitutes a fresh request after an unknown result.
        this.session = await stopDurableDirectedStreamTravel(this.slot, control, operationId, 'pause')
          .catch(async () => ({ ...await loadDirectedStreamSession(this.slot), control }));
        if (this.session.record) this.session.record.state = pauseDirectedStreamTravel(this.session.record.state,
          'Execution failed. Reopen to reconcile before selecting a new destination.');
      }
      throw error;
    }
  }

  async cancel() {
    if (this.stopping) throw new Error('Directed cancellation is already in progress.');
    this.stopping = true;
    this.generation++;
    try {
      // A just-started intention must be published before the cancellation
      // transaction can name it. The repository barrier then fences any move.
      await this.active?.catch(() => undefined);
      const current = await loadDirectedStreamSession(this.slot);
      if (!current.record) return undefined;
      this.session = await stopDurableDirectedStreamTravel(this.slot, this.session.control, current.record.state.operation.id);
      return this.record;
    } finally { this.stopping = false; }
  }
}

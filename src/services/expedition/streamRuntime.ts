import { StreamPlanner } from '../../domain/expedition/streaming/planner';
import type { StreamActionRequest, StreamActionResult, StreamCommand, StreamControl } from '../../domain/expedition/streaming/types';
import { SpaceResidency } from '../../domain/expedition/residency';
import { materializeSpace } from '../../domain/expedition/schematic';
import type { Direction } from '../../domain/types';
import { claimStreamControl, createStreamSlot, executeStreamAction, loadStreamAction,
  loadStreamControl, loadStreamSnapshot, type StreamSnapshot } from '../../persistence/streamRepository';
import { STREAM_CELL_BUDGET, STREAM_SLOT, streamConfiguration, type StreamConfiguration } from './streamConfiguration';

export { STREAM_CELL_BUDGET, STREAM_SLOT, STREAM_RECIPE } from './streamConfiguration';

/** One current knowledge page, bounded geometry, and disposable local route batches. */
export class StreamRuntime {
  snapshot: StreamSnapshot;
  readonly cache = new SpaceResidency(STREAM_CELL_BUDGET, materializeSpace);
  readonly planner = new StreamPlanner();
  faulted = false;
  lastDirection: Direction = 'south';
  private owner: StreamControl;
  private generation = 0;
  private control: Promise<void> = Promise.resolve();
  private active?: Promise<StreamActionResult>;
  private readonly publish: (snapshot: StreamSnapshot) => void;
  readonly slot: string;

  constructor(snapshot: StreamSnapshot, owner: StreamControl, publish: (snapshot: StreamSnapshot) => void, slot = STREAM_SLOT) {
    this.snapshot = snapshot;
    this.owner = owner;
    this.publish = publish;
    this.slot = slot;
  }

  takeOver() {
    this.generation++;
    this.planner.reset();
    const active = this.active;
    this.control = this.control.then(async () => {
      await active;
      this.owner = await claimStreamControl(this.slot, this.owner.sessionId, this.owner.epoch);
    }).catch(error => { this.faulted = true; throw error; });
    return this.control;
  }

  async automatic(): Promise<StreamActionResult | undefined> {
    const generation = this.generation;
    await this.control;
    if (generation !== this.generation || this.active || this.faulted) return undefined;
    const { checkpoint, room } = this.snapshot;
    const decision = this.planner.choose(checkpoint, room.knowledge!, this.owner);
    if (decision.command) return this.start(decision.command);
    throw new Error(decision.reason);
  }

  async dispatch(command: StreamCommand): Promise<StreamActionResult | undefined> {
    const generation = this.generation;
    const { revision, topologyRevision } = this.snapshot.checkpoint;
    await this.control;
    if (generation !== this.generation || this.active || this.faulted) return undefined;
    if (revision !== this.snapshot.checkpoint.revision || topologyRevision !== this.snapshot.checkpoint.topologyRevision) {
      this.planner.reset();
      return undefined;
    }
    return this.start(command);
  }

  // Planning and admission share one post-control turn; a second await would let
  // another automatic caller enter the planner before this.active is assigned.
  private async start(command: StreamCommand): Promise<StreamActionResult> {
    const { revision, topologyRevision } = this.snapshot.checkpoint;
    const request: StreamActionRequest = { version: 2, actionId: crypto.randomUUID(), sessionId: this.owner.sessionId,
      epoch: this.owner.epoch, expectedRevision: revision, expectedTopologyRevision: topologyRevision, command };
    this.active = this.execute(request);
    try { return await this.active; }
    finally { this.active = undefined; }
  }

  private async execute(request: StreamActionRequest): Promise<StreamActionResult> {
    let result: StreamActionResult;
    try {
      result = await executeStreamAction(this.slot, request, space => {
        if (space.schematic !== 'stone-room-v1') throw new Error('Unsupported schematic');
        return this.cache.get(space.spec);
      });
    } catch (error) {
      // Reconcile this exact attempt. Never turn an unknown acknowledgement into a new action.
      const original = await loadStreamAction(this.slot, request).catch(() => undefined);
      if (!original) { this.faulted = true; throw error; }
      result = original.result;
    }
    try {
      const saved = await loadStreamSnapshot(this.slot);
      if (result.disposition === 'applied' && request.command.type === 'move') this.lastDirection = request.command.direction;
      this.snapshot = saved;
      if (saved.checkpoint.revision !== result.afterRevision) this.planner.reset();
      this.publish(saved);
    } catch (error) { this.faulted = true; throw error; }
    if (result.disposition === 'conflict') this.faulted = true;
    return result;
  }
}

export async function openStreamRuntime(cancelled: () => boolean, publish: (snapshot: StreamSnapshot) => void, configuration: StreamConfiguration = streamConfiguration()) {
  const { slot, recipe } = configuration;
  await createStreamSlot(slot, recipe);
  const previous = await loadStreamControl(slot);
  if (cancelled()) return undefined;
  const owner = await claimStreamControl(slot, crypto.randomUUID(), previous?.epoch ?? null);
  return new StreamRuntime(await loadStreamSnapshot(slot), owner, publish, slot);
}

import { expect } from 'vitest';
import { opposite } from '../../../domain/maze/movement';
import type { Direction } from '../../../domain/types';
import { sameAddress } from '../../../domain/expedition/address';
import { SpaceResidency } from '../../../domain/expedition/residency';
import { materializeSpace } from '../../../domain/expedition/schematic';
import { observeStream } from '../../../domain/expedition/streaming/observation';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import { StreamHarness } from '../../../domain/expedition/streaming/testSupport';
import { applyStreamCommand } from '../../../domain/expedition/streaming/transition';
import type { StreamActionResult } from '../../../domain/expedition/streaming/types';
import type { DirectedStreamMove, DirectedStreamTravel, StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { prepareDirectedStreamStep, settleDirectedStreamMove } from './adapter';
import { loadDirectedStreamKnowledge } from './knowledge';

/** Exploration is fixture setup only. The directed adapter never receives this planner or world. */
export async function discoveredWorld(seed = 1, acrossThree = true) {
  const world = new StreamHarness(seed);
  const explorer = new StreamPlanner();
  const reverse: Direction[] = [];
  let target: StreamDestination | undefined;
  for (let i = 0; i < 4000; i++) {
    const page = world.pages.get(world.checkpoint.position.spaceId)!;
    const rooms = [...world.pages.keys()].filter(id => world.topology.space(id)!.spec.kind === 'room');
    const chest = Object.values(page.chests).find(chest => !chest.opened);
    if (rooms.length === 3 && rooms[2] === page.spaceId && chest) {
      target = { kind: 'chest', chestId: chest.id, address: { spaceId: chest.spaceId, row: chest.row, column: chest.column }, arrival: 'occupy' };
      break;
    }
    const decision = explorer.choose(structuredClone(world.checkpoint), structuredClone(page), { sessionId: 'prelude', epoch: 0 });
    if (!decision.command) throw new Error(decision.reason);
    expect((await world.step(decision.command)).applied).toBe(true);
    if (decision.command.type === 'move') reverse.push(opposite(decision.command.direction));
  }
  if (!target) throw new Error('Three-room fixture did not observe a target.');
  for (const direction of reverse.reverse()) expect((await world.step({ type: 'move', direction })).applied).toBe(true);
  expect(world.checkpoint.position).toEqual(world.checkpoint.home);
  const rooms = [...world.pages.keys()].filter(id => world.topology.space(id)!.spec.kind === 'room');
  expect(rooms).toHaveLength(3);
  if (acrossThree) {
    const read = async (id: string) => structuredClone(world.pages.get(id));
    const frame = { checkpoint: world.checkpoint, control: { sessionId: 'prelude', epoch: 0 } };
    const fromHome = await loadDirectedStreamKnowledge(frame, target, read);
    if (fromHome.plan.status !== 'ready') throw new Error(fromHome.plan.reason);
    const visitedRooms = new Set([world.checkpoint.home.spaceId, ...fromHome.plan.route.map(cell => cell.spaceId)]
      .filter(id => rooms.includes(id)));
    if (visitedRooms.size < 3) {
      const secondRoom = world.pages.get(rooms[1])!;
      const destination = Object.values(secondRoom.chests)[0] ?? Object.values(secondRoom.cells)[0];
      const toSecond = await loadDirectedStreamKnowledge(frame, { kind: 'cell', address: destination, arrival: 'occupy' }, read);
      if (toSecond.plan.status !== 'ready') throw new Error(toSecond.plan.reason);
      for (const to of toSecond.plan.route) {
        const direction = toSecond.knowledge.direction(world.checkpoint.position, to)!;
        expect((await world.step({ type: 'move', direction })).applied).toBe(true);
      }
    }
  }
  return { world, target };
}

/** The only host truth consulted during travel is the immediate attempted move. */
export class DirectedTestHost {
  readonly world: StreamHarness;
  readonly cache = new SpaceResidency(512, materializeSpace);
  readonly reads: string[] = [];
  readonly movements: DirectedStreamMove[] = [];
  readonly roomLoads: string[] = [];
  readonly control = { sessionId: 'directed-host', epoch: 7 };
  hiddenCollision?: { from: DirectedStreamMove['from']; to: DirectedStreamMove['to'] };

  constructor(world: StreamHarness) { this.world = world; }
  frame = () => ({ checkpoint: structuredClone(this.world.checkpoint), control: { ...this.control } });
  read = async (spaceId: string) => {
    this.reads.push(spaceId);
    return structuredClone(this.world.pages.get(spaceId));
  };

  async execute(move: DirectedStreamMove): Promise<{ result: StreamActionResult; collision: boolean }> {
    const checkpoint = this.world.checkpoint;
    expect(move.request.expectedRevision).toBe(checkpoint.revision);
    expect(move.request.expectedTopologyRevision).toBe(checkpoint.topologyRevision);
    expect(move.request.epoch).toBe(this.control.epoch);
    expect(move.request.sessionId).toBe(this.control.sessionId);
    expect(move.from).toEqual(checkpoint.position);
    this.movements.push(structuredClone(move));
    const current = this.world.room();
    const collision = !!this.hiddenCollision && sameAddress(this.hiddenCollision.from, move.from) && sameAddress(this.hiddenCollision.to, move.to);
    if (collision) return { collision, result: { actionId: move.request.actionId, disposition: 'refused',
      beforeRevision: checkpoint.revision, afterRevision: checkpoint.revision, topologyRevision: checkpoint.topologyRevision,
      reason: 'The immediate step is obstructed.',
      observation: observeStream(checkpoint, current, current.knowledge!, this.cache.get(current.space.spec)) } };
    const transition = await applyStreamCommand({ header: this.world.topology.header(), checkpoint, current,
      geometry: space => this.cache.get(space.spec), loadRoom: async id => {
        this.roomLoads.push(id);
        expect(id).toBe(move.to.spaceId);
        return this.world.room(id);
      }, prepareNext: async () => { throw new Error('Directed travel has no generation authority.'); } }, move.request.command);
    if (transition.applied) {
      this.world.checkpoint = transition.checkpoint;
      for (const page of transition.pages) this.world.pages.set(page.spaceId, page);
    }
    return { collision: false, result: { actionId: move.request.actionId, disposition: transition.applied ? 'applied' : 'refused',
      beforeRevision: checkpoint.revision, afterRevision: transition.checkpoint.revision,
      topologyRevision: transition.checkpoint.topologyRevision, observation: transition.observation, reason: transition.reason } };
  }
}

export async function travel(host: DirectedTestHost, initial: DirectedStreamTravel) {
  let state = initial;
  for (let i = 0; i < 70 && state.operation.status === 'running'; i++) {
    const proposal = await prepareDirectedStreamStep(state, host.frame(), {
      operationId: state.operation.id, sequence: state.operation.nextStep, actionId: `move-${state.operation.nextStep}`,
    }, host.read, () => 100 + i);
    if (proposal.kind === 'refused') throw new Error(proposal.reason);
    state = proposal.state;
    if (proposal.kind === 'move') {
      const { result, collision } = await host.execute(state.pending!);
      state = settleDirectedStreamMove(state, result, collision);
    }
    expect(host.cache.stats().residentCells).toBeLessThanOrEqual(512);
  }
  return state;
}

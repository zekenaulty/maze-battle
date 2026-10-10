import { addressKey } from '../expedition/address';
import type { CellAddress } from '../expedition/types';
import type { Direction } from '../types';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import type { DirectedSession } from './operationTypes';
import { observeDirected } from './perception';
import { DIRECTED_VERSION } from './types';
import type { DirectedWorld, ObservationReceipt, WorldEvent } from './types';
import { moveDirectedWorld } from './world';
import type { PerceptionProfileId } from './perceptionTypes';
import { isPerceptionProfile } from './perceptionTypes';

export function createDirectedWorld(options: { hiddenTrap?: boolean } = {}): DirectedWorld {
  const world: DirectedWorld = {
    id: 'W1', floorId: 'F1', revision: 0,
    spaces: {
      H: { id: 'H', name: 'Hall', originX: 8, originZ: 0, rows: 5, columns: 5 },
      L: { id: 'L', name: 'Lever Room', originX: 0, originZ: 0, rows: 5, columns: 5 },
      W: { id: 'W', name: 'West Passage', originX: 5, originZ: 2, rows: 1, columns: 3 },
    },
    cells: {},
    features: {
      V: { id: 'V', kind: 'lever', name: 'Lever', position: { spaceId: 'L', row: 2, column: 2 }, state: 'idle' },
      D: { id: 'D', kind: 'door', name: 'Locked Door', position: { spaceId: 'H', row: 2, column: 4 }, state: 'locked' },
    },
  };
  if (options.hiddenTrap ?? true) world.features.T = {
    id: 'T', kind: 'trap', name: 'Hidden Trap', position: { spaceId: 'W', row: 0, column: 1 }, state: 'idle', hidden: true,
    examinationDetail: 'A pressure-sensitive floor mechanism. No safe disarm method is known.',
  };
  const coordinates = new Map<string, CellAddress>();
  for (const space of Object.values(world.spaces)) {
    for (let row = 0; row < space.rows; row++) for (let column = 0; column < space.columns; column++) {
      const address = { spaceId: space.id, row, column };
      coordinates.set(`${space.originX + column},${space.originZ + row}`, address);
      world.cells[addressKey(address)] = { address, exits: {} };
    }
  }
  const offsets: [Direction, number, number][] = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
  for (const cell of Object.values(world.cells)) {
    const space = world.spaces[cell.address.spaceId];
    for (const [direction, dx, dz] of offsets) {
      const next = coordinates.get(`${space.originX + cell.address.column + dx},${space.originZ + cell.address.row + dz}`);
      if (next) cell.exits[direction] = { ...next };
    }
  }
  return world;
}

export function createDirectedFixture(options: { hiddenTrap?: boolean; perceptionProfile?: PerceptionProfileId } = {}): {
  session: DirectedSession; observations: ObservationReceipt[]; events: WorldEvent[];
} {
  const world = createDirectedWorld(options);
  if (options.perceptionProfile !== undefined && !isPerceptionProfile(options.perceptionProfile)) throw new Error('Unknown fixture perception profile.');
  let session: DirectedSession = {
    version: DIRECTED_VERSION, revision: 0, epoch: 0, world,
    actor: { id: 'P1', position: { spaceId: 'H', row: 2, column: 2 } },
    knowledge: emptyDirectedKnowledge('W1', 'P1'),
  };
  if (options.perceptionProfile) session.actor.perceptionProfile = options.perceptionProfile;
  const observations: ObservationReceipt[] = [];
  const events: WorldEvent[] = [];
  const observe = () => {
    const observation = observeDirected(session.world, session.actor, session.knowledge, 'prelude');
    observations.push(observation);
    session = { ...session, knowledge: rememberDirected(session.knowledge, observation) };
  };
  observe();
  for (let step = 0; step < 16; step++) {
    const direction = step < 8 ? 'west' : 'east';
    const destination = session.world.cells[addressKey(session.actor.position)].exits[direction]!;
    const moved = moveDirectedWorld(session.world, session.actor, destination);
    session = { ...session, revision: session.revision + 1, world: moved.world, actor: moved.actor };
    events.push(moved.event);
    observe();
  }
  return { session, observations, events };
}

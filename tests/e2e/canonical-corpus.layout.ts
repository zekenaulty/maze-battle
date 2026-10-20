import type { SpaceSpec } from '../../src/domain/expedition/types';
import type { Direction } from '../../src/domain/types';
import type { ModuleJoin } from '../../src/domain/expedition/topology/modules/types';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { keyedSeed } from '../../src/domain/expedition/topology/seed';
import { connection } from '../../src/domain/expedition/topology/geometry';
import type { WorldFloor } from '../../src/persistence/canonical/world/types';

export type CorpusVariant = 'A' | 'B';
export const CORPUS_VERSION = 'canonical-survey-v1';
export const CORPUS_SEED = 731;
export const CORPUS_TIME = '2026-10-20T12:00:00.000Z';

/** Privileged genesis/audit data. Never feed this layout or its path to a planner. */
export function corpusLayout(variant: CorpusVariant) {
  if (variant !== 'A' && variant !== 'B') throw Error('Unknown corpus variant');
  const recipe = { ...createModuleRecipe('canonical-survey', 1, CORPUS_SEED), roomBudget: 4 };
  recipe.policy = { ...recipe.policy, minSide: 5, maxSide: 5, maxPassage: 7, joins: 'passage' };
  const room = (id: string, row: number, column: number): SpaceSpec => ({
    id, kind: 'room', name: 'Chamber', seed: keyedSeed(recipe.seed, id), origin: { row, column },
    rows: 5, columns: 5, openings: [], chests: [],
  });
  const rooms = [room('entry', 0, 0), room('socket-0:room', 0, 12),
    room('socket-1:room', variant === 'A' ? 0 : -12, variant === 'A' ? 24 : 12),
    room('socket-2:room', -12, 24)];
  const directions: Direction[] = ['east', variant === 'A' ? 'east' : 'north', variant === 'A' ? 'north' : 'east'];
  const passages = directions.map((direction, n): SpaceSpec => {
    const from = rooms[n], vertical = direction === 'north';
    const id = `socket-${n}:passage`;
    return { id, kind: 'passage', name: 'Passage', seed: keyedSeed(recipe.seed, id), openings: [], chests: [],
      rows: vertical ? 7 : 1, columns: vertical ? 1 : 7,
      origin: { row: vertical ? from.origin.row - 7 : from.origin.row + 2,
        column: vertical ? from.origin.column + 2 : from.origin.column + 5 } };
  });
  const joins: ModuleJoin[] = directions.map((direction, n) => ({
    id: `socket-${n}`, fromRoomId: rooms[n].id, toRoomId: rooms[n + 1].id,
    passageId: passages[n].id, direction,
  }));
  const connections = joins.flatMap((join, n) => [
    connection(`${join.id}:entrance`, rooms[n], passages[n], join.direction),
    connection(`${join.id}:exit`, passages[n], rooms[n + 1], join.direction),
  ]);
  const spaces = [...rooms, ...passages];
  const distances = new Map(spaces.map(space => [space.id, space.id === 'entry' ? 0 : Number(/^socket-(\d+)/.exec(space.id)![1]) + 1]));
  const floor: WorldFloor = {
    schema: 1, level: 1, generation: { recipe, scopeId: JSON.stringify(recipe), rooms: 4,
      revision: 3, nextSequence: 3, pendingCount: 0 }, nextPending: 3,
    entry: { spaceId: 'entry', row: 2, column: 2 }, exit: { spaceId: 'socket-2:room', row: 2, column: 2 },
    farthest: { spaceId: 'socket-2:room', distance: 3 },
  };
  return { recipe, floor, rooms, passages, spaces, joins, connections, distances };
}

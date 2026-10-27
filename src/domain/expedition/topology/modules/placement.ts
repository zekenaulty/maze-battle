import type { Direction } from '../../../types';
import type { SpaceSpec } from '../../types';
import { childBounds, overlaps, passageBounds, spaceBounds } from '../geometry';
import { keyedSeed } from '../seed';
import type { Bounds, Occupancy } from '../types';
import type { ModuleRecipe } from './policy';
import type { ModuleSocket, ModuleWork } from './types';

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
export type OccupancyQuery = (bounds: Bounds, except?: string) => boolean;

export function moduleSpace(id: string, kind: SpaceSpec['kind'], bounds: Bounds, seed: number,
  architecture?: ModuleRecipe['architecture']): SpaceSpec {
  return { id, kind, name: kind === 'room' ? 'Chamber' : 'Passage', seed,
    origin: { row: bounds.row, column: bounds.column }, rows: bounds.rows, columns: bounds.columns,
    openings: [], chests: [], ...(kind === 'room' && architecture === 'open-chambers-v1'
      ? { interior: 'open-room-v1' as const, furnishing: 'none' as const } : {}) };
}

/** Reserve exact bounded geometry. A pending socket is never a traversable link. */
export function reserveModuleSockets(recipe: ModuleRecipe, room: SpaceSpec, firstSequence: number, quota: number,
  excluded: Direction | undefined, occupied: OccupancyQuery, added: Occupancy[], work: ModuleWork, except?: string): ModuleSocket[] {
  const result: ModuleSocket[] = [];
  const order = DIRECTIONS.filter(direction => direction !== excluded)
    .sort((a, b) => keyedSeed(recipe.seed, `${room.id}:${a}`) - keyedSeed(recipe.seed, `${room.id}:${b}`));
  for (const direction of order) {
    if (result.length >= quota) break;
    const id = `socket-${firstSequence + result.length}`;
    const candidate = reserveCandidate(recipe, room, direction, id, occupied, added, work, except);
    if (!candidate) continue;
    result.push(candidate);
    added.push(candidate.reservation);
  }
  return result;
}

function reserveCandidate(recipe: ModuleRecipe, source: SpaceSpec, direction: Direction, id: string,
  occupied: OccupancyQuery, added: Occupancy[], work: ModuleWork, except?: string): ModuleSocket | undefined {
  const policy = recipe.policy;
  const sideCount = (policy.maxSide - policy.minSide) / 2 + 1;
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    work.candidates++;
    const value = keyedSeed(recipe.seed, `${source.id}:${direction}:candidate:${attempt}`);
    const rows = policy.minSide + 2 * (value % sideCount);
    const columns = policy.minSide + 2 * ((value >>> 5) % sideCount);
    const gap = policy.joins === 'direct' ? 0 : policy.joins === 'passage' ? 1 + (value >>> 10) % policy.maxPassage
      : (value >>> 10) % 3 === 0 ? 1 + (value >>> 13) % policy.maxPassage : 0;
    const bounds = childBounds(source, direction, rows, columns, gap);
    const passage = gap ? passageBounds(source, bounds, direction) : undefined;
    const reservation: Occupancy = { id, kind: 'reservation', bounds: unionBounds(bounds, passage) };
    const clashes = added.some(entry => { work.localChecks++; return overlaps(entry.bounds, reservation.bounds); });
    if (clashes) continue;
    work.occupancyQueries++;
    if (occupied(reservation.bounds, except)) continue;
    return { id, sourceId: source.id, direction, reservation,
      room: moduleSpace(`${id}:room`, 'room', bounds, keyedSeed(recipe.seed, `${id}:room`), recipe.architecture),
      ...(passage ? { passage: moduleSpace(`${id}:passage`, 'passage', passage, keyedSeed(recipe.seed, `${id}:passage`)) } : {}),
    };
  }
  return undefined;
}

function unionBounds(room: Bounds, passage?: Bounds): Bounds {
  if (!passage) return { ...room };
  const row = Math.min(room.row, passage.row);
  const column = Math.min(room.column, passage.column);
  return { row, column, rows: Math.max(room.row + room.rows, passage.row + passage.rows) - row,
    columns: Math.max(room.column + room.columns, passage.column + passage.columns) - column };
}

export function spaceOccupancy(space: SpaceSpec): Occupancy {
  return { id: space.id, kind: 'space', bounds: spaceBounds(space) };
}

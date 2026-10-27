import { opposite } from '../../../maze/movement';
import type { SpaceSpec } from '../../types';
import { childBounds, connection, passageBounds, spaceBounds } from '../geometry';
import { keyedSeed } from '../seed';
import type { Bounds, Occupancy } from '../types';
import { moduleSpace, reserveModuleSockets, spaceOccupancy, type OccupancyQuery } from './placement';
import { validateModuleRecipe, type ModuleRecipe } from './policy';
import type { ModuleDelta, ModuleSocket, ModuleWork } from './types';

/** Counters only; the caller owns FIFO socket custody and the occupancy index. */
export interface ModuleStepState {
  recipe: ModuleRecipe;
  scopeId: string;
  revision: number;
  rooms: number;
  nextSequence: number;
  pendingCount: number;
}

const emptyWork = (): ModuleWork => ({ candidates: 0, occupancyQueries: 0, localChecks: 0 });

export function bootstrapModule(recipe: ModuleRecipe): {
  state: ModuleStepState; space: SpaceSpec; pending: ModuleSocket[]; occupancy: Occupancy[]; work: ModuleWork;
} {
  validateModuleRecipe(recipe);
  const owned = structuredClone(recipe);
  const side = Math.max(owned.policy.minSide, Math.min(9, owned.policy.maxSide));
  const space = moduleSpace('entry', 'room', { row: 0, column: 0, rows: side, columns: side }, keyedSeed(owned.seed, 'entry'), owned.architecture);
  const occupancy = [spaceOccupancy(space)];
  const work = emptyWork();
  const pending = reserveModuleSockets(owned, space, 0, owned.roomBudget - 1, undefined, () => false, occupancy, work);
  return { state: { recipe: owned, scopeId: JSON.stringify(owned), revision: 0, rooms: 1,
    nextSequence: pending.length, pendingCount: pending.length }, space, pending, occupancy, work };
}

/** Resolve the reserved room verbatim and reserve children from that room, not its parent.
 * Does not commit, look up history, or establish that the supplied reservation is stored. */
export function proposeModuleStep(state: ModuleStepState, socket: ModuleSocket, source: SpaceSpec,
  occupied: OccupancyQuery, requestId: string): ModuleDelta {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128) throw new Error('Invalid module request identity');
  validateStep(state, socket, source);
  if (typeof occupied !== 'function') throw new Error('Invalid module occupancy query');
  const spaces = [socket.room, ...(socket.passage ? [socket.passage] : [])];
  const added = spaces.map(spaceOccupancy);
  const work = emptyWork();
  const remaining = state.recipe.roomBudget - state.rooms - state.pendingCount;
  const pending = reserveModuleSockets(state.recipe, socket.room, state.nextSequence, remaining,
    opposite(socket.direction), (bounds, except) => { validateBounds(bounds); return occupied(bounds, except); }, added, work, socket.id);
  const connections = socket.passage
    ? [connection(`${socket.id}:entrance`, source, socket.passage, socket.direction), connection(`${socket.id}:exit`, socket.passage, socket.room, socket.direction)]
    : [connection(`${socket.id}:door`, source, socket.room, socket.direction)];
  return structuredClone({ scopeId: state.scopeId, expectedRevision: state.revision, requestId, resolved: socket.id, spaces,
    join: { id: socket.id, fromRoomId: source.id, toRoomId: socket.room.id, direction: socket.direction,
      ...(socket.passage ? { passageId: socket.passage.id } : {}) }, connections, pending, work });
}

function validateBounds(bounds: Bounds) {
  if (!bounds || ![bounds.row, bounds.column, bounds.rows, bounds.columns].every(Number.isSafeInteger)
    || bounds.rows < 1 || bounds.columns < 1
    || !Number.isSafeInteger(bounds.row + bounds.rows) || !Number.isSafeInteger(bounds.column + bounds.columns)) {
    throw new Error('Invalid module geometry integers');
  }
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.row === b.row && a.column === b.column && a.rows === b.rows && a.columns === b.columns;
}

function validateSpace(space: SpaceSpec, recipe: ModuleRecipe, id: string, kind: SpaceSpec['kind']) {
  if (!space || space.id !== id || space.kind !== kind || space.seed !== keyedSeed(recipe.seed, id)
    || !space.origin || !Array.isArray(space.openings) || space.openings.length !== 0
    || !Array.isArray(space.chests) || space.chests.length !== 0) throw new Error('Invalid module space binding');
  validateBounds(spaceBounds(space));
  const open = kind === 'room' && recipe.architecture === 'open-chambers-v1';
  if (space.interior !== (open ? 'open-room-v1' : undefined) || space.furnishing !== (open ? 'none' : undefined)) {
    throw new Error('Invalid module architecture binding');
  }
  if (kind === 'room' && [space.rows, space.columns].some(side => side < recipe.policy.minSide
    || side > recipe.policy.maxSide || side % 2 !== 1)) throw new Error('Invalid module room dimensions');
}

function validateStep(state: ModuleStepState, socket: ModuleSocket, source: SpaceSpec) {
  if (!state) throw new Error('Invalid module step state');
  validateModuleRecipe(state.recipe);
  const { recipe, revision, rooms, nextSequence, pendingCount } = state;
  if (state.scopeId !== JSON.stringify(recipe)) throw new Error('Invalid module step scope');
  if (![revision, rooms, nextSequence, pendingCount].every(Number.isSafeInteger)
    || rooms < 1 || rooms >= recipe.roomBudget || revision !== rooms - 1 || pendingCount < 1
    || pendingCount > recipe.roomBudget - rooms || nextSequence !== revision + pendingCount) {
    throw new Error('Invalid module step counters');
  }
  if (!socket || socket.id !== `socket-${revision}` || !source || socket.sourceId !== source.id
    || !['north', 'east', 'south', 'west'].includes(socket.direction)) throw new Error('Invalid module socket binding');
  const sourceSequence = /^socket-(0|[1-9]\d*):room$/.exec(source.id)?.[1];
  if (source.id !== 'entry' && (sourceSequence === undefined || !Number.isSafeInteger(Number(sourceSequence))
    || Number(sourceSequence) >= revision)) throw new Error('Invalid module source binding');
  validateSpace(source, recipe, source.id, 'room');
  if (source.id === 'entry') {
    const side = Math.max(recipe.policy.minSide, Math.min(9, recipe.policy.maxSide));
    if (!sameBounds(spaceBounds(source), { row: 0, column: 0, rows: side, columns: side })) throw new Error('Invalid module entry geometry');
  }
  validateSpace(socket.room, recipe, `${socket.id}:room`, 'room');
  const room = spaceBounds(socket.room);
  let gap = 0;
  if (socket.passage) {
    validateSpace(socket.passage, recipe, `${socket.id}:passage`, 'passage');
    gap = socket.direction === 'north' || socket.direction === 'south' ? socket.passage.rows : socket.passage.columns;
    if (gap > recipe.policy.maxPassage || !sameBounds(spaceBounds(socket.passage), passageBounds(source, room, socket.direction))) {
      throw new Error('Invalid module passage geometry');
    }
  }
  if ((recipe.policy.joins === 'direct' && gap !== 0) || (recipe.policy.joins === 'passage' && gap === 0)
    || !sameBounds(room, childBounds(source, socket.direction, room.rows, room.columns, gap))) {
    throw new Error('Invalid module candidate geometry');
  }
  const passage = socket.passage ? spaceBounds(socket.passage) : room;
  const row = Math.min(room.row, passage.row);
  const column = Math.min(room.column, passage.column);
  const bounds = { row, column, rows: Math.max(room.row + room.rows, passage.row + passage.rows) - row,
    columns: Math.max(room.column + room.columns, passage.column + passage.columns) - column };
  if (!socket.reservation || socket.reservation.id !== socket.id || socket.reservation.kind !== 'reservation') {
    throw new Error('Invalid module reservation binding');
  }
  validateBounds(socket.reservation.bounds);
  if (!sameBounds(socket.reservation.bounds, bounds)) throw new Error('Invalid module reservation geometry');
}

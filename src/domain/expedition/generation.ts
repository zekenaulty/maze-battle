import type { Direction, GridPosition } from '../types';
import { movePosition, opposite } from '../maze/movement';
import { validateSeed } from './schematic';
import type { ExpeditionPlan, ExpeditionRecipe, SpaceSpec } from './types';

export { materializeSpace } from './schematic';

const MAX_SPACES = 24;
const STRIDE = 32;
const SLOTS = [[1, 0], [1, 1], [1, 2], [0, 1], [2, 1], [2, 2]] as const;
const NAMES = ['Entry Hall', 'Crossroads', 'East Vault', 'North Gallery', 'South Hall', 'Lower Vault'];
const CONNECTIONS: [number, number, Direction][] = [
  [0, 1, 'east'], [1, 2, 'east'], [1, 3, 'north'], [1, 4, 'south'], [4, 5, 'east'],
];

/** spaces-v1 pins this finite fixture, including placement and interior rules. */
export function createExpeditionPlan(recipe: ExpeditionRecipe): ExpeditionPlan {
  if (!recipe || recipe.version !== 'spaces-v1') throw new Error('Unsupported expedition version');
  validateSeed(recipe.seed);
  if (!Number.isSafeInteger(recipe.level) || recipe.level < 1) {
    throw new Error('Expedition level must be a positive safe integer');
  }
  for (const id of [recipe.worldId, recipe.floorId]) {
    if (typeof id !== 'string' || id.length > 128 || !id.trim()) {
      throw new Error('World and floor IDs must contain 1-128 characters');
    }
  }

  const tier = Math.min(4, Math.floor((recipe.level - 1) / 3));
  let state = recipe.seed;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const rooms: SpaceSpec[] = SLOTS.map(([row, column], index) => {
    const rows = 7 + 2 * (index % 3) + 2 * tier;
    const columns = 7 + 2 * Math.floor(next() / 0x100000000 * 4) + 2 * tier;
    // The low two bits select a schematic; higher bits vary its details.
    const seed = ((next() & 0xfffffffc) | (index % 3)) >>> 0;
    const id = `room-${index}`;
    return {
      id, kind: 'room', name: NAMES[index], rows, columns, seed,
      origin: { row: 24 + row * STRIDE - Math.floor(rows / 2), column: 24 + column * STRIDE - Math.floor(columns / 2) },
      openings: [],
      chests: index === 0 ? [] : [
        { id: `${id}:chest-0`, cell: { row: 1, column: 1 } },
        ...(tier < 2 ? [] : [{ id: `${id}:chest-1`, cell: { row: rows - 2, column: columns - 2 } }]),
      ],
    };
  });
  const passages = CONNECTIONS.map(([from, to, direction], index) =>
    connectRooms(rooms[from], rooms[to], direction, index, next()));
  const spaces = [...rooms, ...passages];
  if (spaces.length > MAX_SPACES) throw new Error('Finite expedition exceeds 24 spaces');
  const entry = rooms[0];
  return {
    recipe: { ...recipe },
    // Structured identity avoids delimiter collisions and includes the pinned version.
    scopeId: JSON.stringify([recipe.version, recipe.worldId, recipe.floorId, recipe.level, recipe.seed]),
    spaces,
    start: { spaceId: entry.id, row: Math.floor(entry.rows / 2), column: Math.floor(entry.columns / 2) },
  };
}

function boundary(space: SpaceSpec, direction: Direction): GridPosition {
  const center = { row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) };
  switch (direction) {
    case 'north': return { ...center, row: 0 };
    case 'east': return { ...center, column: space.columns - 1 };
    case 'south': return { ...center, row: space.rows - 1 };
    case 'west': return { ...center, column: 0 };
  }
}

function world(space: SpaceSpec, cell: GridPosition): GridPosition {
  return { row: space.origin.row + cell.row, column: space.origin.column + cell.column };
}

function connectRooms(from: SpaceSpec, to: SpaceSpec, direction: Direction, index: number, seed: number): SpaceSpec {
  const fromCell = boundary(from, direction);
  const toCell = boundary(to, opposite(direction));
  const start = movePosition(world(from, fromCell), direction);
  const end = movePosition(world(to, toCell), opposite(direction));
  const passage: SpaceSpec = {
    id: `passage-${index}`, kind: 'passage', name: `Passage ${index + 1}`, seed,
    origin: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
    rows: Math.abs(end.row - start.row) + 1, columns: Math.abs(end.column - start.column) + 1,
    openings: [], chests: [],
  };
  join(from, fromCell, passage, boundary(passage, opposite(direction)), direction, `connection-${index}:a`);
  join(passage, boundary(passage, direction), to, toCell, direction, `connection-${index}:b`);
  return passage;
}

function join(from: SpaceSpec, fromCell: GridPosition, to: SpaceSpec, toCell: GridPosition, direction: Direction, id: string) {
  // Knowledge is keyed by endpoint ID; reciprocity is expressed by destination.
  from.openings.push({ id: `${id}:from`, cell: { ...fromCell }, direction, destination: { spaceId: to.id, ...toCell } });
  to.openings.push({ id: `${id}:to`, cell: { ...toCell }, direction: opposite(direction), destination: { spaceId: from.id, ...fromCell } });
}

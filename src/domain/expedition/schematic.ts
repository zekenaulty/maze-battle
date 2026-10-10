import type { Direction, GridPosition, MazeCellState } from '../types';
import { cellKey } from '../maze/key';
import { movePosition } from '../maze/movement';
import type { SpaceGeometry, SpaceSpec } from './types';

const MAX_CELLS = 512;
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export function validateSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Seed must be an unsigned 32-bit integer');
  }
}

/** Cells are walkable floor only; omitted coordinates are solid pillars/baffles. */
export function materializeSpace(spec: SpaceSpec): SpaceGeometry {
  validateSpec(spec);
  const cells: MazeCellState[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let column = 0; column < spec.columns; column++) {
      if (!isSolid(spec, row, column)) cells.push({ row, column, links: [] });
    }
  }
  const floor = new Set(cells.map(cellKey));
  for (const cell of cells) {
    cell.links = DIRECTIONS.filter((direction) => floor.has(cellKey(movePosition(cell, direction))));
  }
  for (const chest of spec.chests) {
    if (!floor.has(cellKey(chest.cell))) throw new Error('Chest must be on walkable floor');
  }
  // Boundary openings intentionally never become local links out of this geometry.
  return { spaceId: spec.id, rows: spec.rows, columns: spec.columns, cells };
}

function isSolid(spec: SpaceSpec, row: number, column: number): boolean {
  if (spec.kind === 'passage') return false;
  const middleRow = Math.floor(spec.rows / 2);
  const middleColumn = Math.floor(spec.columns / 2);
  // A perimeter ring and central cross keep every port and schematic connected.
  if (row < 2 || column < 2 || row >= spec.rows - 2 || column >= spec.columns - 2 ||
    row === middleRow || column === middleColumn) return false;
  switch (spec.seed & 3) {
    case 0: {
      const pillarRow = 2 + (spec.seed >>> 2) % Math.max(1, middleRow - 2);
      const pillarColumn = 2 + (spec.seed >>> 4) % Math.max(1, middleColumn - 2);
      return (row === pillarRow || row === spec.rows - 1 - pillarRow) &&
        (column === pillarColumn || column === spec.columns - 1 - pillarColumn);
    }
    case 1: {
      const radius = 1 + ((spec.seed >>> 3) % 2);
      return Math.abs(row - middleRow) <= radius && Math.abs(column - middleColumn) <= radius;
    }
    default:
      return ((spec.seed & 4) === 0 ? row : column) % 2 === 0;
  }
}

function validPosition(cell: GridPosition, rows: number, columns: number): boolean {
  return Boolean(cell) && Number.isInteger(cell.row) && Number.isInteger(cell.column) &&
    cell.row >= 0 && cell.row < rows && cell.column >= 0 && cell.column < columns;
}

function validId(id: string): boolean {
  return typeof id === 'string' && id.length <= 128 && Boolean(id.trim());
}

function facesBoundary(spec: SpaceSpec, cell: GridPosition, direction: Direction): boolean {
  switch (direction) {
    case 'north': return cell.row === 0;
    case 'east': return cell.column === spec.columns - 1;
    case 'south': return cell.row === spec.rows - 1;
    case 'west': return cell.column === 0;
    default: return false;
  }
}

function validateSpec(spec: SpaceSpec) {
  if (!spec || !validId(spec.id) || !['room', 'passage'].includes(spec.kind)) {
    throw new Error('Invalid space identity or kind');
  }
  validateSeed(spec.seed);
  if (!Number.isInteger(spec.rows) || !Number.isInteger(spec.columns) ||
    spec.rows < 1 || spec.columns < 1 || spec.rows > MAX_CELLS || spec.columns > MAX_CELLS ||
    spec.rows * spec.columns > MAX_CELLS) {
    throw new Error('Space dimensions must be positive integers totaling at most 512 cells');
  }
  if (!spec.origin || !Number.isSafeInteger(spec.origin.row) || !Number.isSafeInteger(spec.origin.column) ||
    !Number.isSafeInteger(spec.origin.row + (spec.rows - 1)) ||
    !Number.isSafeInteger(spec.origin.column + (spec.columns - 1))) {
    throw new Error('Space origin and bounds must be safe integer coordinates');
  }
  if (!Array.isArray(spec.openings) || spec.openings.length > 2 * (spec.rows + spec.columns) ||
    !Array.isArray(spec.chests) || spec.chests.length > spec.rows * spec.columns) {
    throw new Error('Space metadata exceeds bounded work limits');
  }
  const ids = new Set<string>();
  const ports = new Set<string>();
  const openingCells = new Set<string>();
  for (const opening of spec.openings) {
    if (!opening || !validId(opening.id) || ids.has(opening.id) ||
      !validPosition(opening.cell, spec.rows, spec.columns) || !facesBoundary(spec, opening.cell, opening.direction) ||
      !opening.destination || !validId(opening.destination.spaceId) || opening.destination.spaceId === spec.id ||
      !validPosition(opening.destination, MAX_CELLS, MAX_CELLS)) {
      throw new Error('Opening must uniquely identify an outward boundary port to another space');
    }
    const port = `${cellKey(opening.cell)}:${opening.direction}`;
    if (ports.has(port)) throw new Error('Duplicate opening port');
    ids.add(opening.id);
    ports.add(port);
    openingCells.add(cellKey(opening.cell));
  }
  const chestCells = new Set<string>();
  for (const chest of spec.chests) {
    if (!chest || !validId(chest.id) || ids.has(chest.id) || !validPosition(chest.cell, spec.rows, spec.columns) ||
      openingCells.has(cellKey(chest.cell)) || chestCells.has(cellKey(chest.cell))) {
      throw new Error('Chest must have a unique identity and cell away from openings');
    }
    ids.add(chest.id);
    chestCells.add(cellKey(chest.cell));
  }
}

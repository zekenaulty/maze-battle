import { movePosition, opposite } from '../../maze/movement';
import type { Direction, GridPosition } from '../../types';
import type { SpaceSpec } from '../types';
import type { Bounds, ExpansionSocket, TopologyConnection } from './types';

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.row < b.row + b.rows && b.row < a.row + a.rows
    && a.column < b.column + b.columns && b.column < a.column + a.columns;
}

export function boundary(space: Pick<SpaceSpec, 'rows' | 'columns'>, direction: Direction): GridPosition {
  const center = { row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) };
  switch (direction) {
    case 'north': return { ...center, row: 0 };
    case 'south': return { ...center, row: space.rows - 1 };
    case 'east': return { ...center, column: space.columns - 1 };
    case 'west': return { ...center, column: 0 };
  }
}

export function world(space: Pick<SpaceSpec, 'origin'>, cell: GridPosition): GridPosition {
  return { row: space.origin.row + cell.row, column: space.origin.column + cell.column };
}

export function spaceBounds(space: SpaceSpec): Bounds {
  return { ...space.origin, rows: space.rows, columns: space.columns };
}

export function ahead(origin: GridPosition, direction: Direction, distance: number): GridPosition {
  switch (direction) {
    case 'north': return { row: origin.row - distance, column: origin.column };
    case 'south': return { row: origin.row + distance, column: origin.column };
    case 'east': return { row: origin.row, column: origin.column + distance };
    case 'west': return { row: origin.row, column: origin.column - distance };
  }
}

export function childBounds(source: SpaceSpec, direction: Direction, rows: number, columns: number, gap: number): Bounds {
  const entry = ahead(world(source, boundary(source, direction)), direction, gap + 1);
  const local = boundary({ rows, columns }, opposite(direction));
  return { row: entry.row - local.row, column: entry.column - local.column, rows, columns };
}

export function passageBounds(source: SpaceSpec, child: Bounds, direction: Direction): Bounds {
  const start = movePosition(world(source, boundary(source, direction)), direction);
  const target = { ...child, origin: { row: child.row, column: child.column } };
  const end = movePosition(world(target, boundary(target, opposite(direction))), opposite(direction));
  return { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column),
    rows: Math.abs(end.row - start.row) + 1, columns: Math.abs(end.column - start.column) + 1 };
}

export function connection(id: string, from: SpaceSpec, to: SpaceSpec, direction: Direction): TopologyConnection {
  return { id, from: { spaceId: from.id, ...boundary(from, direction) },
    to: { spaceId: to.id, ...boundary(to, opposite(direction)) }, direction };
}

export function reservedBounds(source: SpaceSpec, socket: Pick<ExpansionSocket, 'direction' | 'fallback'>): Bounds {
  const passage = passageBounds(source, socket.fallback, socket.direction);
  const row = Math.min(passage.row, socket.fallback.row);
  const column = Math.min(passage.column, socket.fallback.column);
  return { row, column, rows: Math.max(passage.row + passage.rows, socket.fallback.row + socket.fallback.rows) - row,
    columns: Math.max(passage.column + passage.columns, socket.fallback.column + socket.fallback.columns) - column };
}

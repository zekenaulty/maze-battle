import type { GridPosition } from '../types';

export function cellKey(position: GridPosition) {
  return `${position.row}:${position.column}`;
}

export function samePosition(a: GridPosition, b: GridPosition) {
  return a.row === b.row && a.column === b.column;
}

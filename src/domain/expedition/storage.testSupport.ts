import type { SpaceGeometry, SpaceSpec } from './types';
import type { Direction, GridPosition } from '../types';
import { cellKey } from '../maze/key';
import { movePosition } from '../maze/movement';

export function testSpace(id = 'room-a', rows = 2, columns = 2): SpaceSpec {
  return { id, kind: 'room', name: id, origin: { row: 0, column: 0 }, rows, columns, seed: 42, openings: [], chests: [] };
}

export function testGeometry(spec: SpaceSpec, obstacles: GridPosition[] = []): SpaceGeometry {
  const blocked = new Set(obstacles.map(cellKey));
  const geometry: SpaceGeometry = {
    spaceId: spec.id, rows: spec.rows, columns: spec.columns,
    cells: Array.from({ length: spec.rows * spec.columns }, (_, index) => ({
      row: Math.floor(index / spec.columns), column: index % spec.columns, links: [],
    })).filter(cell => !blocked.has(cellKey(cell))),
  };
  const floor = new Set(geometry.cells.map(cellKey));
  const directions: Direction[] = ['north', 'east', 'south', 'west'];
  for (const cell of geometry.cells) cell.links = directions.filter(direction => floor.has(cellKey(movePosition(cell, direction))));
  return geometry;
}

export function sparseTestGeometry(spec: SpaceSpec): SpaceGeometry {
  return testGeometry(spec, [{ row: spec.rows - 1, column: 0 }]);
}

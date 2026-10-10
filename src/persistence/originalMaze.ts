import type { Direction, GridPosition, MazeState } from '../domain/types';
import { array, integer, record } from './originalSaveValidation';

const directions: [Direction, number, number, Direction][] = [
  ['north', -1, 0, 'south'], ['east', 0, 1, 'west'],
  ['south', 1, 0, 'north'], ['west', 0, -1, 'east'],
];
const key = (p: GridPosition) => `${p.row}:${p.column}`;

export function convertOriginalMaze(value: unknown): MazeState {
  const source = record(value, 'maze');
  const rows = integer(source.rows, 'maze.rows', 1, 1024);
  const columns = integer(source.columns, 'maze.columns', 1, 1024);
  const size = rows * columns;
  if (size > 16_384) throw new Error('maze: exceeds 16384 cells');
  const position = (value: unknown, path: string): GridPosition => {
    const p = record(value, path);
    return { row: integer(p.row, `${path}.row`, 0, rows - 1), column: integer(p.column, `${path}.column`, 0, columns - 1) };
  };
  const savedCells = array(source.cells, 'maze.cells', size);
  if (savedCells.length !== size) throw new Error('maze.cells: incomplete grid');
  const cells = savedCells.map((value, i) => {
    const path = `maze.cells[${i}]`;
    const cell = record(value, path);
    const p = position(cell, path);
    const savedLinks = record(cell.links, `${path}.links`);
    if (key(position(savedLinks, `${path}.links`)) !== key(p)) throw new Error(`${path}.links: wrong owner`);
    const links = array(savedLinks.items, `${path}.links.items`, 4).map((item) => {
      const neighbor = position(item, `${path}.links.items`);
      const direction = directions.find(([, dr, dc]) => p.row + dr === neighbor.row && p.column + dc === neighbor.column);
      if (!direction) throw new Error(`${path}.links: non-adjacent neighbor`);
      return direction[0];
    });
    if (new Set(links).size !== links.length) throw new Error(`${path}.links: duplicate neighbor`);
    return { ...p, links };
  });
  const byPosition = new Map(cells.map((cell) => [key(cell), cell]));
  if (byPosition.size !== size) throw new Error('maze.cells: duplicate cell');
  for (const cell of cells) {
    for (const [direction, dr, dc, opposite] of directions) {
      if (cell.links.includes(direction) && !byPosition.get(key({ row: cell.row + dr, column: cell.column + dc }))?.links.includes(opposite)) {
        throw new Error(`maze.cells[${key(cell)}].links: non-reciprocal ${direction}`);
      }
    }
  }
  const start = position(source.start, 'maze.start');
  const end = position(source.end, 'maze.end');
  const active = position(source.active, 'maze.active');
  const visited = array(source.visited, 'maze.visited', 65_536).map((p, i) => position(p, `maze.visited[${i}]`));
  // Original generators create one connected grid. Reject corruption instead of generating replacement topology.
  const reached = new Set([key(start)]);
  const pending = [start];
  for (let i = 0; i < pending.length; i++) {
    const cell = byPosition.get(key(pending[i]))!;
    for (const [direction, dr, dc] of directions) {
      const next = { row: cell.row + dr, column: cell.column + dc };
      if (cell.links.includes(direction) && !reached.has(key(next))) {
        reached.add(key(next));
        pending.push(next);
      }
    }
  }
  if (reached.size !== size) throw new Error('maze.cells: disconnected grid');
  return { rows, columns, start, end, active, visited, cells };
}

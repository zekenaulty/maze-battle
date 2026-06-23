import type { Direction, GridPosition, MazeCellState, MazeState } from '../types';
import { defaultRng, sample, type Rng } from '../combat/rng';
import { cellKey } from './key';
import { movePosition, opposite } from './movement';
import { revealMazeVisibility } from './visibility';

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export function generateMaze(rows: number, columns: number, rng: Rng = defaultRng): MazeState {
  const cells = createCells(rows, columns);
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const start = { row: 0, column: 0 };
  const stack: GridPosition[] = [start];
  const visited = new Set([cellKey(start)]);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = unvisitedNeighbors(current, rows, columns, visited);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = sample(neighbors, rng);
    const currentCell = byKey.get(cellKey(current));
    const nextCell = byKey.get(cellKey(next.position));
    currentCell?.links.push(next.direction);
    nextCell?.links.push(opposite(next.direction));
    visited.add(cellKey(next.position));
    stack.push(next.position);
  }

  return revealMazeVisibility({
    rows,
    columns,
    start,
    end: { row: rows - 1, column: columns - 1 },
    active: start,
    visited: [start],
    cells,
  });
}

function createCells(rows: number, columns: number): MazeCellState[] {
  const cells: MazeCellState[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ row, column, links: [] });
    }
  }
  return cells;
}

function unvisitedNeighbors(position: GridPosition, rows: number, columns: number, visited: Set<string>) {
  return DIRECTIONS.map((direction) => ({ direction, position: movePosition(position, direction) })).filter(
    (candidate) =>
      candidate.position.row >= 0 &&
      candidate.position.column >= 0 &&
      candidate.position.row < rows &&
      candidate.position.column < columns &&
      !visited.has(cellKey(candidate.position)),
  );
}

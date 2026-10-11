import type { MazeCellState, MazeState } from '../../domain/types';
import { isMazeFloorCell } from './mazeFloor';
import type { MazeViewport } from './mazeCamera';

// Merge equal row runs before tracing: adjacent fractional rectangles can leave
// antialiased internal edges even when submitted as a single canvas path.
export function appendMazeFloorPath(
  context: CanvasRenderingContext2D,
  maze: MazeState,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  viewport: MazeViewport | undefined,
  eligible: (cell: MazeCellState) => boolean,
) {
  const bounds = viewport ?? { rowStart: 0, rowEnd: maze.rows, columnStart: 0, columnEnd: maze.columns };
  const cells = new Set<number>();
  for (const cell of maze.cells) {
    if (cell.row >= bounds.rowStart && cell.row < bounds.rowEnd && cell.column >= bounds.columnStart && cell.column < bounds.columnEnd
      && isMazeFloorCell(maze, cell) && eligible(cell)) cells.add(cell.row * maze.columns + cell.column);
  }
  const runs = new Map<string, { row: number; column: number; end: number }>();
  const flush = (key: string, rowEnd: number) => {
    const run = runs.get(key)!;
    const x = offsetX + run.column * cellSize;
    const y = offsetY + run.row * cellSize;
    context.rect(x, y, offsetX + run.end * cellSize - x, offsetY + rowEnd * cellSize - y);
    runs.delete(key);
  };
  for (let row = bounds.rowStart; row < bounds.rowEnd; row++) {
    const continuing = new Set<string>();
    let column = bounds.columnStart;
    while (column < bounds.columnEnd) {
      if (!cells.has(row * maze.columns + column)) { column++; continue; }
      const start = column++;
      while (column < bounds.columnEnd && cells.has(row * maze.columns + column)) column++;
      const key = `${start}:${column}`;
      continuing.add(key);
      if (!runs.has(key)) runs.set(key, { row, column: start, end: column });
    }
    for (const key of runs.keys()) if (!continuing.has(key)) flush(key, row);
  }
  for (const key of runs.keys()) flush(key, bounds.rowEnd);
  return cells;
}

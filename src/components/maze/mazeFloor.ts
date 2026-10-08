import type { MazeCellState, MazeState } from '../../domain/types';
import { samePosition } from '../../domain/maze/key';

// V2 solid space is derived from the movement graph, never a second saved mask.
export function isMazeFloorCell(maze: MazeState, cell: MazeCellState) {
  return maze.layout?.version !== 'structured-v2' || cell.links.length > 0 || samePosition(cell, maze.start);
}

import type { MazeCellState, MazeState } from '../../domain/types';
import { samePosition } from '../../domain/maze/key';

export function hasMazeVoids(maze: MazeState) {
  return maze.layout?.version === 'structured-v2' || maze.layout?.version === 'structured-v3';
}

// Solid space is derived from the movement graph, never a second saved mask.
export function isMazeFloorCell(maze: MazeState, cell: MazeCellState) {
  return !hasMazeVoids(maze) || cell.links.length > 0 || samePosition(cell, maze.start);
}

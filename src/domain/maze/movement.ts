import type { Direction, GridPosition, MazeState } from '../types';
import { cellKey, samePosition } from './key';

export function canMove(maze: MazeState, direction: Direction) {
  const active = maze.cells.find((cell) => samePosition(cell, maze.active));
  return Boolean(active?.links.includes(direction));
}

export function movePosition(position: GridPosition, direction: Direction): GridPosition {
  switch (direction) {
    case 'north':
      return { row: position.row - 1, column: position.column };
    case 'east':
      return { row: position.row, column: position.column + 1 };
    case 'south':
      return { row: position.row + 1, column: position.column };
    case 'west':
      return { row: position.row, column: position.column - 1 };
  }
}

export function linkMap(maze: MazeState) {
  return new Map(maze.cells.map((cell) => [cellKey(cell), cell]));
}

export function opposite(direction: Direction): Direction {
  switch (direction) {
    case 'north':
      return 'south';
    case 'east':
      return 'west';
    case 'south':
      return 'north';
    case 'west':
      return 'east';
  }
}

import type { GridPosition, MazeState } from '../types';
import { cellKey } from './key';
import { linkedVision } from './linkedVision';
import { mazeCellAt, movePosition } from './movement';

export interface MazeVisibilitySnapshot {
  radius: number;
  visible: Set<string>;
  explored: Set<string>;
}

export const DEFAULT_VISION_RADIUS = 7;

export function createMazeVisibilitySnapshot(maze: MazeState): MazeVisibilitySnapshot {
  const radius = maze.visibility?.radius ?? DEFAULT_VISION_RADIUS;
  const visible = positionSet(computeVisibleCells(maze, maze.active, radius));
  const explored = positionSet([...(maze.visibility?.explored ?? maze.visited), ...visiblePositions(visible)]);

  return {
    radius,
    visible,
    explored,
  };
}

export function revealMazeVisibility(maze: MazeState, radius = maze.visibility?.radius ?? DEFAULT_VISION_RADIUS): MazeState {
  const visible = computeVisibleCells(maze, maze.active, radius);
  const explored = mergePositions([...(maze.visibility?.explored ?? maze.visited), ...visible]);

  return {
    ...maze,
    visibility: {
      radius,
      explored,
    },
  };
}

export function computeVisibleCells(maze: MazeState, origin: GridPosition = maze.active, radius = DEFAULT_VISION_RADIUS): GridPosition[] {
  return linkedVision(origin, radius, cellKey, (position) => {
    const cell = mazeCellAt(maze, position);
    return (cell?.links ?? [])
      .map(direction => movePosition(position, direction))
      .filter(next => Boolean(mazeCellAt(maze, next)));
  }).map(({ row, column }) => ({ row, column }));
}

export function isCellVisible(visibility: MazeVisibilitySnapshot | undefined, position: GridPosition) {
  return !visibility || visibility.visible.has(cellKey(position));
}

export function isCellExplored(visibility: MazeVisibilitySnapshot | undefined, position: GridPosition) {
  return !visibility || visibility.visible.has(cellKey(position)) || visibility.explored.has(cellKey(position));
}

function mergePositions(positions: GridPosition[]) {
  return visiblePositions(positionSet(positions));
}

function positionSet(positions: Iterable<GridPosition>) {
  const keys = new Set<string>();
  for (const position of positions) {
    keys.add(cellKey(position));
  }
  return keys;
}

function visiblePositions(keys: Iterable<string>) {
  return Array.from(keys).map((key) => {
    const [row, column] = key.split(':').map(Number);
    return { row, column };
  });
}

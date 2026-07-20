import type { Direction, GridPosition, MazeState } from '../types';
import { cellKey, samePosition } from './key';
import { linkMap, movePosition } from './movement';

interface SearchNode {
  position: GridPosition;
  path: Direction[];
}

export function nextDirectionToTarget(maze: MazeState, target: GridPosition = maze.end): Direction | undefined {
  return findPath(maze, target)?.directions[0];
}

export interface MazePath {
  target: GridPosition;
  directions: Direction[];
  distance: number;
}

export function findPath(maze: MazeState, target: GridPosition, from: GridPosition = maze.active): MazePath | undefined {
  if (samePosition(from, target)) {
    return { target, directions: [], distance: 0 };
  }

  const result = findNearestPath(maze, [target], from);
  return result?.path;
}

export function findNearestPath(maze: MazeState, targets: GridPosition[], from: GridPosition = maze.active) {
  const targetKeys = new Set(targets.map(cellKey));
  if (targetKeys.size === 0) {
    return undefined;
  }

  if (targetKeys.has(cellKey(from))) {
    return { target: from, path: { target: from, directions: [], distance: 0 } satisfies MazePath };
  }

  const cells = linkMap(maze);
  const queue: SearchNode[] = [{ position: from, path: [] }];
  const visited = new Set([cellKey(from)]);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const cell = cells.get(cellKey(current.position));

    for (const direction of cell?.links ?? []) {
      const nextPosition = movePosition(current.position, direction);
      const key = cellKey(nextPosition);
      if (visited.has(key)) {
        continue;
      }

      const path = [...current.path, direction];
      if (targetKeys.has(key)) {
        return {
          target: nextPosition,
          path: { target: nextPosition, directions: path, distance: path.length } satisfies MazePath,
        };
      }

      visited.add(key);
      queue.push({ position: nextPosition, path });
    }
  }

  return undefined;
}

export function pathDistance(maze: MazeState, target: GridPosition, from: GridPosition = maze.active) {
  return findPath(maze, target, from)?.distance ?? Infinity;
}

import type { Direction, GridPosition, MazeState } from '../types';
import { cellKey, samePosition } from './key';
import { linkMap, movePosition } from './movement';

interface SearchNode {
  position: GridPosition;
  firstDirection?: Direction;
}

export function nextDirectionToTarget(maze: MazeState, target: GridPosition = maze.end): Direction | undefined {
  if (samePosition(maze.active, target)) {
    return undefined;
  }

  const cells = linkMap(maze);
  const queue: SearchNode[] = [{ position: maze.active }];
  const visited = new Set([cellKey(maze.active)]);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const cell = cells.get(cellKey(current.position));

    for (const direction of cell?.links ?? []) {
      const nextPosition = movePosition(current.position, direction);
      const key = cellKey(nextPosition);
      if (visited.has(key)) {
        continue;
      }

      const firstDirection = current.firstDirection ?? direction;
      if (samePosition(nextPosition, target)) {
        return firstDirection;
      }

      visited.add(key);
      queue.push({ position: nextPosition, firstDirection });
    }
  }

  return undefined;
}

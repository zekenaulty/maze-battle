import type { GridPosition, MazeState } from '../types';
import { cellKey } from './key';
import { mazeCellAt, movePosition, opposite } from './movement';
import { findPath } from './solver';
import { createMazeVisibilitySnapshot } from './visibility';

export const MAX_CLICK_STEPS = 64;

/** RPG saves remember explored tiles, not historical edges. Only current sight
 * can supply connections: never look up a remembered-but-unseen tile's links. */
export function findClickRoute(maze: MazeState, target: GridPosition) {
  if (!Number.isInteger(target.row) || !Number.isInteger(target.column)) return undefined;
  const { visible, explored } = createMazeVisibilitySnapshot(maze);
  if (!explored.has(cellKey(target)) || !visible.has(cellKey(target))) return undefined;
  const cells = [...visible].flatMap(key => {
    const [row, column] = key.split(':').map(Number);
    const cell = mazeCellAt(maze, { row, column });
    if (!cell) return [];
    return [{ row, column, links: cell.links.filter(direction => {
      const next = movePosition(cell, direction);
      return visible.has(cellKey(next)) && Boolean(mazeCellAt(maze, next)?.links.includes(opposite(direction)));
    }) }];
  });
  const route = findPath({ ...maze, cells }, target);
  return route && route.distance <= MAX_CLICK_STEPS ? route : undefined;
}

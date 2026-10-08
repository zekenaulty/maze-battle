import type { Direction, GridPosition, MazeState } from '../types';
import { cellKey } from './key';
import { linkMap, movePosition } from './movement';

export interface MazePath {
  target: GridPosition;
  directions: Direction[];
  distance: number;
}

export interface MazePathSearch {
  distanceTo(target: GridPosition): number;
  pathTo(target: GridPosition): MazePath | undefined;
  readonly visitedCount: number;
}

interface SearchNode {
  position: GridPosition;
  distance: number;
  parent?: SearchNode;
  direction?: Direction;
}

// Maze cells are immutable domain state. Movement changes active/visibility, not topology.
const searches = new WeakMap<MazeState['cells'], Map<string, MazePathSearch>>();
const MAX_CACHED_SOURCES = 4;

export function createMazePathSearch(maze: MazeState, from: GridPosition = maze.active): MazePathSearch {
  const sourceKey = `${maze.rows}:${maze.columns}:${cellKey(from)}`;
  const cached = searches.get(maze.cells) ?? new Map<string, MazePathSearch>();
  const existing = cached.get(sourceKey);
  if (existing) {
    cached.delete(sourceKey);
    cached.set(sourceKey, existing);
    return existing;
  }

  const cells = linkMap(maze);
  const inBounds = (position: GridPosition) => Number.isInteger(position.row) && Number.isInteger(position.column)
    && position.row >= 0 && position.column >= 0 && position.row < maze.rows && position.column < maze.columns;
  const root: SearchNode = { position: from, distance: 0 };
  const queue = cells.has(cellKey(from)) && inBounds(from) ? [root] : [];
  const visited = new Map(queue.map((node) => [cellKey(node.position), node]));

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const direction of cells.get(cellKey(current.position))?.links ?? []) {
      const position = movePosition(current.position, direction);
      const key = cellKey(position);
      if (!inBounds(position) || !cells.has(key) || visited.has(key)) continue;
      const next: SearchNode = { position, distance: current.distance + 1, parent: current, direction };
      visited.set(key, next);
      queue.push(next);
    }
  }

  const search: MazePathSearch = {
    visitedCount: visited.size,
    distanceTo: (target) => visited.get(cellKey(target))?.distance ?? Infinity,
    pathTo(target) {
      let node = visited.get(cellKey(target));
      if (!node) return undefined;
      const directions: Direction[] = [];
      while (node.parent && node.direction) {
        directions.push(node.direction);
        node = node.parent;
      }
      directions.reverse();
      return { target, directions, distance: directions.length };
    },
  };

  cached.set(sourceKey, search);
  if (cached.size > MAX_CACHED_SOURCES) cached.delete(cached.keys().next().value!);
  searches.set(maze.cells, cached);
  return search;
}

export function nextDirectionToTarget(maze: MazeState, target: GridPosition = maze.end): Direction | undefined {
  return findPath(maze, target)?.directions[0];
}

export function findPath(maze: MazeState, target: GridPosition, from: GridPosition = maze.active): MazePath | undefined {
  return createMazePathSearch(maze, from).pathTo(target);
}

export function findNearestPath(maze: MazeState, targets: GridPosition[], from: GridPosition = maze.active) {
  if (targets.length === 0) return undefined;
  const search = createMazePathSearch(maze, from);
  const target = targets.reduce<GridPosition | undefined>((best, candidate) =>
    search.distanceTo(candidate) < (best ? search.distanceTo(best) : Infinity) ? candidate : best, undefined);
  const path = target && search.pathTo(target);
  return path ? { target: path.target, path } : undefined;
}

export function pathDistance(maze: MazeState, target: GridPosition, from: GridPosition = maze.active) {
  return createMazePathSearch(maze, from).distanceTo(target);
}

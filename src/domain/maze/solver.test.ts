import { describe, expect, it } from 'vitest';
import type { MazeState } from '../types';
import { createMazePathSearch, findNearestPath, findPath, nextDirectionToTarget, pathDistance } from './solver';
import { lineMaze } from '../automation/autopilotTestFixtures';

describe('maze solver', () => {
  it('returns the next linked direction toward the exit', () => {
    const maze: MazeState = {
      rows: 2,
      columns: 2,
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
      active: { row: 0, column: 0 },
      visited: [{ row: 0, column: 0 }],
      cells: [
        { row: 0, column: 0, links: ['east'] },
        { row: 0, column: 1, links: ['west', 'south'] },
        { row: 1, column: 0, links: [] },
        { row: 1, column: 1, links: ['north'] },
      ],
    };

    expect(nextDirectionToTarget(maze)).toBe('east');
    expect(findPath(maze, maze.end)?.directions).toEqual(['east', 'south']);
    expect(pathDistance(maze, maze.end)).toBe(2);
  });

  it('answers many targets from one cached predecessor tree without copying paths during BFS', () => {
    const maze = lineMaze(1000);
    const paths = createMazePathSearch(maze);
    expect(paths.visitedCount).toBe(1000);
    expect(paths.distanceTo({ row: 0, column: 999 })).toBe(999);
    expect(paths.pathTo({ row: 0, column: 999 })?.directions).toHaveLength(999);
    expect(createMazePathSearch({ ...maze, active: { row: 0, column: 10 } }, maze.start)).toBe(paths);
    expect(findNearestPath(maze, [{ row: 0, column: 300 }, { row: 0, column: 40 }])?.path.distance).toBe(40);
    expect(findNearestPath(maze, [])).toBeUndefined();
    const changed = { ...maze, cells: maze.cells.map((cell) => ({ ...cell, links: [] })) };
    expect(createMazePathSearch(changed)).not.toBe(paths);
    expect(findPath(changed, maze.end)).toBeUndefined();
  });

  it('does not walk dangling links or accept nonexistent zero-distance cells', () => {
    const maze = lineMaze(2);
    maze.cells = [{ row: 0, column: 0, links: ['east', 'north'] }];
    expect(findPath(maze, { row: -1, column: 0 })).toBeUndefined();
    expect(findPath(maze, maze.end)).toBeUndefined();
    expect(findPath(maze, maze.end, maze.end)).toBeUndefined();
    expect(findPath(maze, maze.start)?.distance).toBe(0);
  });
});

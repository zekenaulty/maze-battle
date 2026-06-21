import { describe, expect, it } from 'vitest';
import type { MazeState } from '../types';
import { nextDirectionToTarget } from './solver';

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
  });
});

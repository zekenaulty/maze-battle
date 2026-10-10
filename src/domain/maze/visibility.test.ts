import { describe, expect, it } from 'vitest';
import type { MazeState } from '../types';
import { cellKey } from './key';
import { computeVisibleCells, createMazeVisibilitySnapshot, revealMazeVisibility } from './visibility';

describe('maze visibility', () => {
  it('reveals cells by linked path distance instead of raw geometry', () => {
    const maze = makeMaze();
    const visible = new Set(computeVisibleCells(maze, { row: 0, column: 0 }, 2).map(cellKey));

    expect(visible).toContain('0:0');
    expect(visible).toContain('0:1');
    expect(visible).toContain('0:2');
    expect(visible).not.toContain('1:0');
    expect(visible).not.toContain('1:1');
  });

  it('keeps explored cells after they leave current visibility', () => {
    const startRevealed = revealMazeVisibility(makeMaze(), 1);
    const moved = revealMazeVisibility(
      {
        ...startRevealed,
        active: { row: 0, column: 2 },
        visited: [...startRevealed.visited, { row: 0, column: 1 }, { row: 0, column: 2 }],
      },
      1,
    );
    const snapshot = createMazeVisibilitySnapshot(moved);

    expect(snapshot.visible.has('0:0')).toBe(false);
    expect(snapshot.explored.has('0:0')).toBe(true);
    expect(snapshot.visible.has('0:2')).toBe(true);
  });
});

function makeMaze(): MazeState {
  return {
    rows: 2,
    columns: 3,
    start: { row: 0, column: 0 },
    end: { row: 1, column: 2 },
    active: { row: 0, column: 0 },
    visited: [{ row: 0, column: 0 }],
    cells: [
      { row: 0, column: 0, links: ['east'] },
      { row: 0, column: 1, links: ['west', 'east'] },
      { row: 0, column: 2, links: ['west', 'south'] },
      { row: 1, column: 0, links: [] },
      { row: 1, column: 1, links: [] },
      { row: 1, column: 2, links: ['north'] },
    ],
  };
}

import { describe, expect, it } from 'vitest';
import type { MazeState } from '../../domain/types';
import type { MazeVisibilitySnapshot } from '../../domain/maze/visibility';
import { projectMaze3D } from './projection';

function maze(): MazeState {
  return {
    rows: 2, columns: 2,
    start: { row: 0, column: 0 },
    end: { row: 0, column: 1 },
    active: { row: 0, column: 0 },
    visited: [{ row: 0, column: 0 }],
    cells: [
      { row: 0, column: 0, links: ['east'] },
      { row: 0, column: 1, links: ['west'] },
      { row: 1, column: 1, links: [] },
    ],
  };
}

function visibility(...keys: string[]): MazeVisibilitySnapshot {
  return { radius: 7, visible: new Set(keys), explored: new Set(keys) };
}

describe('read-only 3D projection', () => {
  it('projects visible linked cells without mutating topology or state', () => {
    const state = maze();
    const before = JSON.stringify(state);
    const cells = projectMaze3D(state, visibility('0:0', '0:1'));
    expect(cells).toHaveLength(2);
    expect(cells[0].exits.east).toBe('doorway');
    expect(cells[1].exits.west).toBe('doorway');
    expect(cells[0].exits.north).toBe('wall');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not expose unrevealed geometry', () => {
    const cells = projectMaze3D(maze(), visibility('0:0'));
    expect(cells).toHaveLength(1);
    expect(cells[0].exits.east).toBe('wall');
  });

  it('removes internal walls within the same canonical room', () => {
    const state = maze();
    state.layout = {
      version: 'structured-v2', mainPath: [], zones: [],
      rooms: [{
        id: 'hall', kind: 'start', name: 'Hall',
        row: 0, column: 0, rows: 1, columns: 2,
        center: { row: 0, column: 0 }, tags: ['safe'],
      }],
    };
    const cells = projectMaze3D(state, visibility('0:0', '0:1'));
    expect(cells[0].exits.east).toBe('open');
    expect(cells[1].exits.west).toBe('open');
  });

  it('respects its geometric projection radius', () => {
    expect(projectMaze3D(maze(), visibility('0:0', '0:1'), 0)).toHaveLength(1);
  });
});

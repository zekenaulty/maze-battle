import { describe, expect, it } from 'vitest';
import type { MazeState } from '../src/domain/types';
import { appendMazeFloorPath } from '../src/components/maze/mazeFloorPath';
import { collectWalls } from '../src/components/maze/drawMaze';

function fixture(): MazeState {
  return { rows: 2, columns: 3, start: { row: 0, column: 0 }, end: { row: 1, column: 2 },
    active: { row: 0, column: 0 }, visited: [],
    cells: Array.from({ length: 6 }, (_, index) => ({ row: Math.floor(index / 3), column: index % 3, links: [] })) };
}

describe('compositor feature projection', () => {
  it('merges adjacent fractional tiles into one floor rectangle', () => {
    const rects: number[][] = [];
    const context = { rect: (...args: number[]) => rects.push(args) } as CanvasRenderingContext2D;
    const cells = appendMazeFloorPath(context, fixture(), 40.083333333333336, 66, 8, undefined, () => true);
    expect(cells.size).toBe(6);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual([66, 8, 120.25, 80.16666666666667]);
  });

  it('keeps holes out of the union and ignores cell array order', () => {
    const maze = fixture();
    maze.cells.reverse();
    const rects: number[][] = [];
    const context = { rect: (...args: number[]) => rects.push(args) } as CanvasRenderingContext2D;
    appendMazeFloorPath(context, maze, 10, 0, 0, undefined, cell => cell.row === 0 || cell.column === 0);
    expect(rects).toEqual([[0, 0, 30, 10], [0, 10, 10, 10]]);
  });

  it('preserves a known boundary without revealing unknown adjoining wall branches', () => {
    const maze = fixture();
    const knowledge = { radius: 1, explored: new Set(['0:0']), visible: new Set<string>() };
    const before = JSON.stringify(maze);
    expect(collectWalls(maze, undefined, undefined, knowledge)).toEqual({
      horizontal: new Set(['0:0', '1:0']), vertical: new Set(['0:0', '0:1']),
    });
    expect(JSON.stringify(maze)).toBe(before);
    expect([...knowledge.explored]).toEqual(['0:0']);
  });

  it('does not turn remembered void flags into floor or walls in v2/v3', () => {
    for (const version of ['structured-v2', 'structured-v3'] as const) {
      const maze = fixture();
      maze.layout = { version, rooms: [], zones: [], mainPath: [] };
      const knowledge = { radius: 1, explored: new Set(['1:2']), visible: new Set(['1:2']) };
      expect(collectWalls(maze, undefined, undefined, knowledge)).toEqual({ horizontal: new Set(), vertical: new Set() });
      const rects: number[][] = [];
      const context = { rect: (...args: number[]) => rects.push(args) } as CanvasRenderingContext2D;
      appendMazeFloorPath(context, maze, 10, 0, 0, undefined, cell => knowledge.visible.has(`${cell.row}:${cell.column}`));
      expect(rects).toEqual([]);
    }
  });
});

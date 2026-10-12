import { describe, expect, it } from 'vitest';
import { lineMaze } from '../../domain/automation/autopilotTestFixtures';
import { DEFAULT_MAZE_CAMERA } from './mazeCamera';
import { mazeGridGeometry, mazeTileAt } from './mazeHitTest';

describe('canvas CSS coordinates', () => {
  it('uses an explicit scope-local viewport, not a second follow-camera offset', () => {
    const maze = { ...lineMaze(31), rows: 11, columns: 13, active: { row: 7, column: 8 } };
    const viewport = { rowStart: 0, columnStart: 0, rowEnd: 11, columnEnd: 13, rows: 11, columns: 13 };
    const camera = { mode: 'manual' as const, zoom: 1, origin: { row: 200, column: 300 } };
    const bounds = { left: 10, top: 70, width: 800.5, height: 600.5 };
    const size = { width: 800, height: 600 };
    for (const mode of ['camera', 'overview'] as const) {
      const grid = mazeGridGeometry(maze, size, camera, mode, viewport);
      const x = bounds.left + (grid.x + 8.5 * grid.cellSize) * bounds.width / size.width;
      const y = bounds.top + (grid.y + 7.5 * grid.cellSize) * bounds.height / size.height;
      expect(mazeTileAt(maze, bounds, camera, mode, x, y, viewport)).toEqual({ row: 7, column: 8 });
      expect(mazeTileAt(maze, bounds, camera, mode, bounds.left, bounds.top, viewport)).toBeUndefined();
    }
  });

  it.each(['camera', 'overview'] as const)('round-trips cell centers and refuses padding at fractional sizes in %s', mode => {
    const maze = { ...lineMaze(31), rows: 23, active: { row: 14, column: 17 } };
    for (const size of [{ width: 1171.5, height: 630.25 }, { width: 387.75, height: 421.25 }]) {
      for (const camera of [DEFAULT_MAZE_CAMERA, { mode: 'manual' as const, zoom: 1.3, origin: { row: 4, column: 6 } }]) {
        const bounds = { ...size, left: 21.25, top: 137.5 };
        const pixels = { width: Math.floor(size.width), height: Math.floor(size.height) };
        const grid = mazeGridGeometry(maze, pixels, camera, mode);
        for (const row of [0, grid.viewport.rows - 1]) for (const column of [0, grid.viewport.columns - 1]) {
          const x = bounds.left + (grid.x + (column + .5) * grid.cellSize) * size.width / pixels.width;
          const y = bounds.top + (grid.y + (row + .5) * grid.cellSize) * size.height / pixels.height;
          expect(mazeTileAt(maze, bounds, camera, mode, x, y)).toEqual({ row: row + grid.viewport.rowStart, column: column + grid.viewport.columnStart });
        }
        expect(mazeTileAt(maze, bounds, camera, mode, bounds.left, bounds.top)).toBeUndefined();
      }
    }
  });
});

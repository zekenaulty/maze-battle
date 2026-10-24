import { describe, expect, it } from 'vitest';
import type { MazeState } from '../../domain/types';
import { cameraCellSize, createMazeCamera, isInViewport, panMazeCamera, zoomMazeCamera, type MazeCameraState } from './mazeCamera';
import { mazeGridGeometry, mazeTileAt } from './mazeHitTest';

const desktop = { width: 1397, height: 1197 };
const sizes = [desktop, { width: 390, height: 844 }, { width: 844, height: 390 }];
const zooms = [0.7, 1, 1.6];

describe('mazeCamera', () => {
  it('keeps a high-floor maze in a readable local viewport', () => {
    const maze = makeMaze(62, 66, 25, 13);
    const viewport = createMazeCamera(maze, desktop);

    expect(viewport.rows).toBe(17);
    expect(viewport.columns).toBe(21);
    expect(viewport.rowStart).toBe(17);
    expect(viewport.columnStart).toBe(3);
    expect(cameraCellSize(desktop, viewport)).toBeGreaterThanOrEqual(60);
  });

  it('follows every step without a page threshold or stale manual origin', () => {
    const camera: MazeCameraState = { mode: 'follow', zoom: 1, origin: { row: 200, column: 300 } };
    const first = createMazeCamera(makeMaze(62, 66, 33, 20), desktop, camera);
    const moved = createMazeCamera(makeMaze(62, 66, 34, 21), desktop, camera);
    expect(moved.rowStart).toBe(first.rowStart + 1);
    expect(moved.columnStart).toBe(first.columnStart + 1);
    expect(moved.rowStart + Math.floor(moved.rows / 2)).toBe(34);
    expect(moved.columnStart + Math.floor(moved.columns / 2)).toBe(21);
    expect(createMazeCamera(makeMaze(62, 66, 34, 21), desktop, { mode: 'manual', zoom: 1 })).toEqual(moved);
  });

  it.each([[62, 66], [1, 1], [2, 2], [3, 5], [7, 9]])('centers all edges and corners of a %i by %i map at every zoom', (rows, columns) => {
    for (const size of sizes) for (const zoom of zooms) {
      const camera: MazeCameraState = { mode: 'follow', zoom };
      const extent = createMazeCamera(makeMaze(1000, 1000, 0, 0), size, camera);
      for (const row of [0, Math.floor(rows / 2), rows - 1]) for (const column of [0, Math.floor(columns / 2), columns - 1]) {
        const maze = makeMaze(rows, columns, row, column), viewport = createMazeCamera(maze, size, camera);
        expect(viewport.rows).toBe(extent.rows); expect(viewport.columns).toBe(extent.columns);
        expect(viewport.rows % 2).toBe(1); expect(viewport.columns % 2).toBe(1);
        expect(viewport.rowStart).toBe(row - Math.floor(viewport.rows / 2));
        expect(viewport.columnStart).toBe(column - Math.floor(viewport.columns / 2));
        expect(isInViewport(maze.active, viewport)).toBe(true);
      }
    }
  });

  it('never consults hidden map dimensions when choosing a follow viewport', () => {
    const maze = makeMaze(1, 1, -25, -13);
    for (const name of ['rows', 'columns']) Object.defineProperty(maze, name, { get() { throw new Error(`Hidden dimension: ${name}`); } });
    expect(createMazeCamera(maze, desktop)).toMatchObject({ rowStart: -33, columnStart: -23, rows: 17, columns: 21 });
  });

  it('supports manual panning and zooming', () => {
    const maze = makeMaze(62, 66, 25, 13);
    const panned = panMazeCamera(maze, desktop, { mode: 'follow', zoom: 1 }, 3, 4);
    const zoomedOut = createMazeCamera(maze, desktop, zoomMazeCamera(panned, -0.3));

    expect(panned).toMatchObject({
      mode: 'manual',
      origin: { row: 20, column: 7 },
    });
    expect(zoomedOut.rows).toBeGreaterThan(17);
    expect(zoomedOut.columns).toBeGreaterThan(21);
    expect(zoomedOut).toMatchObject({ rowStart: 20, columnStart: 7 });
    const moved = createMazeCamera(makeMaze(1, 1, -100, -200), desktop, panned);
    expect(moved).toMatchObject({ rowStart: 20, columnStart: 7 });
    const negative = panMazeCamera(makeMaze(1, 1, 0, 0), desktop, { mode: 'follow', zoom: 1 }, -3, -4);
    expect(negative.origin).toEqual({ row: -11, column: -14 });
    expect(zoomMazeCamera(panned, -100).zoom).toBe(0.7);
    expect(zoomMazeCamera(panned, 100).zoom).toBe(1.6);
  });

  it('keeps signed viewports bounded with safe integer exclusive ends', () => {
    for (const size of [...sizes, { width: 0, height: 0 }, { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER }])
      for (const zoom of zooms) for (const coordinate of [Number.MIN_SAFE_INTEGER, -1000, 0, Number.MAX_SAFE_INTEGER]) {
        const maze = makeMaze(1, 1, coordinate, coordinate);
        for (const camera of [{ mode: 'follow', zoom }, { mode: 'manual', zoom, origin: maze.active }] satisfies MazeCameraState[]) {
          const viewport = createMazeCamera(maze, size, camera);
          expect(Object.values(viewport).every(Number.isSafeInteger)).toBe(true);
          expect(viewport.rows * viewport.columns).toBeLessThanOrEqual(1024);
          expect(viewport.rowEnd - viewport.rowStart).toBe(viewport.rows);
          expect(viewport.columnEnd - viewport.columnStart).toBe(viewport.columns);
          const panned = panMazeCamera(maze, size, camera, coordinate, coordinate);
          expect(Number.isSafeInteger(panned.origin!.row)).toBe(true);
          expect(Number.isSafeInteger(panned.origin!.column)).toBe(true);
        }
      }
  });

  it('round-trips centered cells and signed viewport corners through fractional-size hit tests', () => {
    for (const position of [{ row: 0, column: 0 }, { row: 61, column: 65 }, { row: -25, column: -13 }])
      for (const dimensions of [{ rows: 1, columns: 1 }, { rows: 62, columns: 66 }])
        for (const bounds of [{ left: 21.25, top: 137.5, width: 1171.5, height: 630.25 }, { left: 4.5, top: 12.25, width: 387.75, height: 421.25 }])
          for (const zoom of zooms) {
            const maze = makeMaze(dimensions.rows, dimensions.columns, position.row, position.column);
            const camera: MazeCameraState = { mode: 'follow', zoom };
            const pixels = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
            const grid = mazeGridGeometry(maze, pixels, camera, 'camera'), { viewport } = grid;
            for (const row of [0, Math.floor(viewport.rows / 2), viewport.rows - 1])
              for (const column of [0, Math.floor(viewport.columns / 2), viewport.columns - 1]) {
                const x = bounds.left + (grid.x + (column + 0.5) * grid.cellSize) * bounds.width / pixels.width;
                const y = bounds.top + (grid.y + (row + 0.5) * grid.cellSize) * bounds.height / pixels.height;
                expect(mazeTileAt(maze, bounds, camera, 'camera', x, y)).toEqual({ row: viewport.rowStart + row, column: viewport.columnStart + column });
              }
            expect(mazeTileAt(maze, bounds, camera, 'camera', bounds.left, bounds.top)).toBeUndefined();
          }
  });
});

function makeMaze(rows: number, columns: number, row: number, column: number): MazeState {
  return {
    rows,
    columns,
    start: { row: 0, column: 0 },
    end: { row: rows - 1, column: columns - 1 },
    active: { row, column },
    visited: [{ row, column }],
    cells: [],
  };
}

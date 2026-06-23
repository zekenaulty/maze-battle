import { describe, expect, it } from 'vitest';
import type { MazeState } from '../../domain/types';
import { cameraCellSize, createMazeCamera, panMazeCamera, zoomMazeCamera } from './mazeCamera';

describe('mazeCamera', () => {
  it('keeps a high-floor maze in a readable local viewport', () => {
    const maze = makeMaze(62, 66, 25, 13);
    const viewport = createMazeCamera(maze, { width: 1397, height: 1197 });

    expect(viewport.rows).toBe(17);
    expect(viewport.columns).toBe(21);
    expect(viewport.rowStart).toBe(17);
    expect(viewport.columnStart).toBe(0);
    expect(cameraCellSize({ width: 1397, height: 1197 }, viewport)).toBeGreaterThanOrEqual(60);
  });

  it('locks the viewport to a room until the active cell crosses a page threshold', () => {
    const size = { width: 1397, height: 1197 };
    const first = createMazeCamera(makeMaze(62, 66, 25, 13), size);
    const sameRoom = createMazeCamera(makeMaze(62, 66, 33, 20), size);
    const nextRoom = createMazeCamera(makeMaze(62, 66, 34, 21), size);

    expect(sameRoom).toMatchObject({
      rowStart: first.rowStart,
      columnStart: first.columnStart,
    });
    expect(nextRoom).toMatchObject({
      rowStart: 34,
      columnStart: 21,
    });
  });

  it('clamps the camera at map edges', () => {
    const maze = makeMaze(62, 66, 0, 0);
    const viewport = createMazeCamera(maze, { width: 1397, height: 1197 });

    expect(viewport.rowStart).toBe(0);
    expect(viewport.columnStart).toBe(0);
  });

  it('supports manual panning and zooming', () => {
    const maze = makeMaze(62, 66, 25, 13);
    const size = { width: 1397, height: 1197 };
    const panned = panMazeCamera(maze, size, { mode: 'follow', zoom: 1 }, 3, 4);
    const zoomedOut = createMazeCamera(maze, size, zoomMazeCamera(panned, -0.3));

    expect(panned).toMatchObject({
      mode: 'manual',
      origin: { row: 20, column: 4 },
    });
    expect(zoomedOut.rows).toBeGreaterThan(17);
    expect(zoomedOut.columns).toBeGreaterThan(21);
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

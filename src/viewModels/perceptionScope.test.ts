import { describe, expect, it } from 'vitest';
import { freeze } from '../domain/agentic/knowledge/shared';
import type { MazeState } from '../domain/types';
import { panMazeCamera, zoomMazeCamera, type MazeCameraState } from '../components/maze/mazeCamera';
import { perceptionScope } from './perceptionScope';

const size = { width: 1397, height: 1197 }, follow: MazeCameraState = { mode: 'follow', zoom: 1 };
const limit = Number.MAX_SAFE_INTEGER;

describe('perception scope display policy', () => {
  it.each([
    { width: 1397, height: 1197, rows: 17, columns: 21 },
    { width: 390, height: 844, rows: 11, columns: 9 },
    { width: 844, height: 390, rows: 9, columns: 13 },
    { width: 0, height: 0, rows: 7, columns: 9 },
  ])('uses a reasonable display rectangle for $width x $height', ({ width, height, rows, columns }) => {
    expect(perceptionScope(7, { row: 0, column: 0 }, { width, height }, follow, 'camera'))
      .toEqual({ floor: 7, row: 0, column: 0, rows, columns });
  });

  it('never reads hidden geometry, dimensions, seed, contents or fog to choose the scope', () => {
    const actor = { row: 1, column: 2 };
    for (const property of ['rows', 'columns', 'maze', 'cells', 'rooms', 'chests', 'seed', 'visibility', 'visited']) {
      Object.defineProperty(actor, property, { get() { throw new Error(`Hidden world read: ${property}`); } });
    }
    expect(perceptionScope(1, actor, size, follow, 'camera')).toEqual({ floor: 1, row: 0, column: 0, rows: 17, columns: 21 });
    for (const worldSize of [3, 1000, limit]) {
      const withHiddenDimensions = { row: 1, column: 2, rows: worldSize, columns: worldSize };
      expect(perceptionScope(1, withHiddenDimensions, size, follow, 'camera'))
        .toEqual(perceptionScope(1, actor, size, follow, 'camera'));
    }
    expect(perceptionScope(1, actor, size, follow, 'overview').rows).toBe(32);
  });

  it.each(['camera', 'overview'] as const)('pages independently by %s dimensions instead of following every step', mode => {
    const initial = perceptionScope(1, { row: 0, column: 0 }, size, follow, mode);
    const { rows, columns } = initial;
    expect(perceptionScope(1, { row: rows - 1, column: columns - 1 }, size, follow, mode)).toEqual(initial);
    expect(perceptionScope(1, { row: rows, column: columns - 1 }, size, follow, mode))
      .toEqual({ ...initial, row: rows });
    expect(perceptionScope(1, { row: rows - 1, column: columns }, size, follow, mode))
      .toEqual({ ...initial, column: columns });
    expect(perceptionScope(1, { row: rows * 5 + 1, column: columns * 7 + 2 }, size, follow, mode))
      .toEqual({ ...initial, row: rows * 5, column: columns * 7 });
  });

  it('ignores stale manual origins in follow mode and falls back to paging without a manual origin', () => {
    const actor = { row: 25, column: 44 }, expected = { floor: 1, row: 17, column: 42, rows: 17, columns: 21 };
    expect(perceptionScope(1, actor, size, { ...follow, origin: { row: 500, column: 600 } }, 'camera')).toEqual(expected);
    expect(perceptionScope(1, actor, size, { mode: 'manual', zoom: 1 }, 'camera')).toEqual(expected);
  });

  it('keeps a manual pan anchored through actor movement, zoom and overview changes', () => {
    const actor = { row: 25, column: 13 };
    const surface: MazeState = { rows: limit, columns: limit, active: actor, start: actor, end: actor, visited: [], cells: [] };
    const panned = panMazeCamera(surface, size, follow, 3, 4), before = structuredClone(panned);
    expect(panned).toEqual({ mode: 'manual', zoom: 1, origin: { row: 20, column: 4 } });
    const expected = { floor: 1, row: 20, column: 4, rows: 17, columns: 21 };
    expect(perceptionScope(1, actor, size, panned, 'camera')).toEqual(expected);
    expect(perceptionScope(1, { row: 800, column: 900 }, size, panned, 'camera')).toEqual(expected);
    expect(perceptionScope(1, actor, size, zoomMazeCamera(panned, -100), 'camera'))
      .toEqual({ ...expected, rows: 23, columns: 29 });
    expect(perceptionScope(1, actor, size, zoomMazeCamera(panned, 100), 'camera'))
      .toEqual({ ...expected, rows: 9, columns: 13 });
    expect(perceptionScope(1, actor, size, panned, 'overview')).toEqual({ ...expected, rows: 32, columns: 32 });
    expect(panned).toEqual(before);
    expect(perceptionScope(1, actor, size, follow, 'camera')).toEqual({ ...expected, row: 17, column: 0 });
  });

  it('expands overview around its own pages and caps each axis instead of exposing full world dimensions', () => {
    const compact = { width: 390, height: 844 }, actor = { row: 25, column: 20 };
    expect(perceptionScope(1, actor, compact, follow, 'camera'))
      .toEqual({ floor: 1, row: 22, column: 18, rows: 11, columns: 9 });
    expect(perceptionScope(1, actor, compact, follow, 'overview'))
      .toEqual({ floor: 1, row: 23, column: 19, rows: 23, columns: 19 });
    expect(perceptionScope(1, actor, size, follow, 'overview'))
      .toEqual({ floor: 1, row: 0, column: 0, rows: 32, columns: 32 });
  });

  it.each(['camera', 'overview'] as const)('bounds %s area and integer coordinates across viewport sizes, zooms and distant pages', mode => {
    for (const pixels of [{ width: 0, height: 0 }, { width: 390, height: 844 }, size,
      { width: 8000, height: 100 }, { width: 100, height: 8000 }, { width: limit, height: limit }]) {
      for (const zoom of [-100, 0.7, 1, 1.6, 100]) for (const coordinate of [0, 1_000_000, limit - 1]) {
        const actor = { row: coordinate, column: coordinate };
        for (const camera of [{ mode: 'follow', zoom }, { mode: 'manual', zoom, origin: actor }] satisfies MazeCameraState[]) {
          const result = perceptionScope(1, actor, pixels, camera, mode), context = JSON.stringify({ pixels, camera, mode });
          expect(Object.values(result).every(Number.isSafeInteger), context).toBe(true);
          expect(result.rows, context).toBeGreaterThanOrEqual(7);
          expect(result.columns, context).toBeGreaterThanOrEqual(9);
          expect(result.rows, context).toBeLessThanOrEqual(32);
          expect(result.columns, context).toBeLessThanOrEqual(32);
          expect(result.rows * result.columns, context).toBeLessThanOrEqual(1024);
          expect(result.row, context).toBeGreaterThanOrEqual(0);
          expect(result.column, context).toBeGreaterThanOrEqual(0);
          expect(result.row + result.rows, context).toBeLessThanOrEqual(limit);
          expect(result.column + result.columns, context).toBeLessThanOrEqual(limit);
          expect(result.row <= actor.row && actor.row < result.row + result.rows, context).toBe(true);
          expect(result.column <= actor.column && actor.column < result.column + result.columns, context).toBe(true);
        }
      }
    }
  });

  it.each(['camera', 'overview'] as const)('clamps manual %s origins to zero and safe exclusive ends', mode => {
    const actor = { row: 1, column: 2 }, camera: MazeCameraState = { mode: 'manual', zoom: 1 };
    const negative = perceptionScope(1, actor, size, { ...camera, origin: { row: -100, column: -1 } }, mode);
    expect(negative.row).toBe(0); expect(negative.column).toBe(0);
    const high = perceptionScope(limit, actor, size, { ...camera, origin: { row: limit, column: limit } }, mode);
    expect(high.floor).toBe(limit);
    expect(high.row).toBe(limit - high.rows); expect(high.column).toBe(limit - high.columns);
    expect(high.row + high.rows).toBe(limit); expect(high.column + high.columns).toBe(limit);
  });

  it('does not mutate frozen display inputs or let later caller mutations alter a captured scope', () => {
    const input = freeze({ actor: { row: 25, column: 13 }, size: { ...size },
      camera: { mode: 'manual' as const, zoom: 1, origin: { row: 20, column: 4 } } });
    const before = structuredClone(input);
    const result = perceptionScope(1, input.actor, input.size, input.camera, 'camera');
    expect(input).toEqual(before);
    const mutable = structuredClone(input), captured = perceptionScope(1, mutable.actor, mutable.size, mutable.camera, 'camera');
    mutable.actor.column = 999; mutable.camera.origin.row = 999; mutable.camera.zoom = 0.7; mutable.size.width = 10;
    expect(captured).toEqual(result);
  });
});

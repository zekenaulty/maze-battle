import { describe, expect, it } from 'vitest';
import { earnedCell, knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import { readKnowledgeRegion } from '../persistence/canonical/knowledge/region';
import { collectWalls } from '../components/maze/drawMaze';
import { mazeGridGeometry, mazeTileAt } from '../components/maze/mazeHitTest';
import { linkMap } from '../domain/maze/movement';
import { canonicalPerceptionScope, createCanonicalMazeView, currentVisibleCell } from './canonicalPerceivedMaze';

const camera = { mode: 'follow' as const, zoom: 1 };
describe('canonical draw-only maze', () => {
  it('uses earned coordinates for renderer-local cells, actor, chests, stairs and world click addresses', async () => {
    const f = knowledgeFixture(), cell = earnedCell(-5, -2, 'negative-room', 2, 3); cell.stairs = ['town'];
    await f.observe([cell]);
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), { floor: 1, row: -7, column: -9, rows: 7, columns: 9 });
    const view = createCanonicalMazeView(region, 'south');
    expect(view.maze.active).toEqual({ row: 2, column: 7 }); expect(view.maze.start).toEqual(view.maze.active);
    expect(view.chests).toEqual([view.maze.active]); expect(view.visibility.visible).toEqual(new Set(['2:7']));
    for (const mode of ['camera', 'overview'] as const) {
      const bounds = { left: 4, top: 12, width: 600, height: 400 }, grid = mazeGridGeometry(view.maze, bounds, camera, mode, view.viewport);
      const hit = mazeTileAt(view.maze, bounds, camera, mode,
        bounds.left + grid.x + 7.5 * grid.cellSize, bounds.top + grid.y + 2.5 * grid.cellSize, view.viewport)!;
      expect({ row: hit.row + view.origin.row, column: hit.column + view.origin.column }).toEqual(cell.world);
    }
    expect(view.maze).not.toHaveProperty('layout');
    expect(collectWalls(view.maze, linkMap(view.maze), view.viewport, view.visibility).horizontal.size).toBe(2);
  });

  it('does not turn omitted coverage into walls or blend retained edges into current sight', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); await f.observe([cell]); await f.observe([{ ...cell, edges: {} }]);
    const scope = { floor: 1, row: -8, column: -4, rows: 8, columns: 8 };
    const view = createCanonicalMazeView(await readKnowledgeRegion(f.pages, f.checkpoint(), scope), 'east');
    expect(view.maze.cells[0].links).toEqual(['north', 'east', 'south', 'west']);
    expect(collectWalls(view.maze, linkMap(view.maze), view.viewport, view.visibility)).toEqual({ horizontal: new Set(), vertical: new Set() });
  });

  it('finds the current chest only at the exact visible checkpoint address and sequence', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); const observation = await f.observe([cell]);
    const game = { checkpoint: f.checkpoint(), observation };
    expect(currentVisibleCell(game)?.chests).toEqual(cell.chests);
    expect(currentVisibleCell({ ...game, observation: null })).toBeUndefined();
    expect(currentVisibleCell({ ...game, checkpoint: { ...game.checkpoint, mode: 'town' } })).toBeUndefined();
    expect(currentVisibleCell({ ...game, checkpoint: { ...game.checkpoint, position: earnedCell(0, 0, 'elsewhere').at } })).toBeUndefined();
    expect(currentVisibleCell({ ...game, observation: { ...observation, header: { ...observation.header, sequence: 9 } } })).toBeUndefined();
  });

  it('preserves negative follow/manual origins and bounds all desktop/mobile/zoom/overview scopes', () => {
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 480 }, { width: 1, height: 1 }])
      for (const zoom of [0.7, 1, 1.6]) for (const mode of ['camera', 'overview'] as const) {
        const scope = canonicalPerceptionScope(1, { row: -5, column: -2 }, size, { ...camera, zoom }, mode);
        expect(scope.row).toBeLessThan(0); expect(scope.column).toBeLessThan(0);
        expect(scope.row + scope.rows).toBeGreaterThan(-5); expect(scope.column + scope.columns).toBeGreaterThan(-2);
        expect(scope.rows * scope.columns).toBeLessThanOrEqual(1024);
        const manual = canonicalPerceptionScope(1, { row: 20, column: 10 }, size,
          { mode: 'manual', zoom, origin: { row: -100, column: -200 } }, mode);
        expect(manual).toMatchObject({ row: -100, column: -200 });
        for (const coordinate of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
          const edge = canonicalPerceptionScope(1, { row: coordinate, column: coordinate }, size, { ...camera, zoom }, mode);
          expect(Number.isSafeInteger(edge.row)).toBe(true); expect(Number.isSafeInteger(edge.row + edge.rows)).toBe(true);
        }
      }
  });

  it('centers the actor at each zoom without reading hidden dimensions or accepting stale manual origins', () => {
    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 480 }, { width: 1, height: 1 }])
      for (const zoom of [0.7, 1, 1.6]) for (const actor of [{ row: 0, column: 0 }, { row: -5, column: -2 }, { row: 1000, column: 500 }]) {
        for (const name of ['rows', 'columns', 'maze', 'layout']) Object.defineProperty(actor, name, { configurable: true, get() { throw new Error(`Hidden geometry: ${name}`); } });
        const follow = { ...camera, zoom, origin: { row: 200, column: 300 } };
        const scope = canonicalPerceptionScope(1, actor, size, follow, 'camera');
        expect(scope.row).toBe(actor.row - Math.floor(scope.rows / 2));
        expect(scope.column).toBe(actor.column - Math.floor(scope.columns / 2));
        const moved = canonicalPerceptionScope(1, { row: actor.row + 1, column: actor.column - 1 }, size, follow, 'camera');
        expect(moved).toEqual({ ...scope, row: scope.row + 1, column: scope.column - 1 });
        expect(canonicalPerceptionScope(1, actor, size, { mode: 'manual', zoom }, 'camera')).toEqual(scope);
      }
  });

  it('retains explicit overview paging and a signed manual anchor through movement and zoom', () => {
    const size = { width: 1440, height: 1000 }, actor = { row: -5, column: 10 };
    const first = canonicalPerceptionScope(1, actor, size, camera, 'overview');
    expect(first).toEqual({ floor: 1, row: -32, column: 0, rows: 32, columns: 32 });
    expect(canonicalPerceptionScope(1, { row: -1, column: 31 }, size, camera, 'overview')).toEqual(first);
    expect(canonicalPerceptionScope(1, { row: 0, column: 32 }, size, camera, 'overview')).toEqual({ ...first, row: 0, column: 32 });
    const manual = { mode: 'manual' as const, zoom: 1, origin: { row: -100, column: -200 } };
    for (const mode of ['camera', 'overview'] as const) for (const zoom of [0.7, 1, 1.6]) {
      const scope = canonicalPerceptionScope(1, actor, size, { ...manual, zoom }, mode);
      expect(scope).toMatchObject(manual.origin);
      expect(canonicalPerceptionScope(1, { row: 500, column: -1000 }, size, { ...manual, zoom }, mode)).toEqual(scope);
    }
  });

  it('keeps the centered scope local for drawing and world hit addresses across negative origins and zoom', async () => {
    for (const world of [{ row: 0, column: 0 }, { row: -5, column: -2 }, { row: 25, column: 13 }]) {
      const f = knowledgeFixture(), cell = earnedCell(world.row, world.column); await f.observe([cell]);
      for (const zoom of [0.7, 1, 1.6]) {
        const camera = { mode: 'follow' as const, zoom }, bounds = { left: 4.5, top: 12.25, width: 600.75, height: 400.5 };
        const pixels = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
        const scope = canonicalPerceptionScope(1, world, pixels, camera, 'camera');
        const view = createCanonicalMazeView(await readKnowledgeRegion(f.pages, f.checkpoint(), scope), 'south');
        expect(view.maze.active).toEqual({ row: Math.floor(scope.rows / 2), column: Math.floor(scope.columns / 2) });
        const grid = mazeGridGeometry(view.maze, pixels, camera, 'camera', view.viewport);
        const x = bounds.left + (grid.x + (view.maze.active.column + 0.5) * grid.cellSize) * bounds.width / pixels.width;
        const y = bounds.top + (grid.y + (view.maze.active.row + 0.5) * grid.cellSize) * bounds.height / pixels.height;
        const hit = mazeTileAt(view.maze, bounds, camera, 'camera', x, y, view.viewport)!;
        expect(hit).toEqual(view.maze.active);
        expect({ row: hit.row + view.origin.row, column: hit.column + view.origin.column }).toEqual(world);
      }
    }
  });
});

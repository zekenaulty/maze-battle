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
});

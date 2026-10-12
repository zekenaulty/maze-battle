import { describe, expect, it, vi } from 'vitest';
import type { RpgPerceivedCell, RpgPerceptionRegion } from '../domain/agentic/knowledge/perceptionTypes';
import type { RpgObservedCell, RpgRememberedCell, RpgSource, RpgStair } from '../domain/agentic/knowledge/types';
import type { Direction } from '../domain/types';
import { isCellExplored, isCellVisible } from '../domain/maze/visibility';
import { linkMap } from '../domain/maze/movement';
import { collectWalls } from '../components/maze/drawMaze';
import { isInViewport } from '../components/maze/mazeCamera';
import { appendMazeFloorPath } from '../components/maze/mazeFloorPath';
import { createPerceivedMazeView, type PerceivedMazeView } from './perceivedMaze';

const source: RpgSource = { id: 'receipt-1', gameId: 'game-1', observedAt: '2026-10-12T00:00:00Z',
  revision: { owner: 'owner', epoch: 1, revision: 1 } };
const directions: Direction[] = ['north', 'east', 'south', 'west'];
const at = (row: number, column: number, floor = 1) => ({ floor, row, column });
const chest = (row: number, column: number, opened = false) => ({ id: 'chest', position: at(row, column), opened });
const fact = (row: number, column: number, extra: Partial<RpgRememberedCell> = {}): RpgRememberedCell =>
  ({ address: at(row, column), source, roomIds: [], chests: [], stairs: [], edges: {}, ...extra });
const remembered = (row: number, column: number, extra: Partial<RpgRememberedCell> = {}): RpgPerceivedCell =>
  ({ state: 'remembered', fact: fact(row, column, extra) });
const visible = (row: number, column: number, extra: Partial<RpgObservedCell> = {}, old = fact(row, column)): RpgPerceivedCell =>
  ({ state: 'visible', fact: old, observation: { address: at(row, column), roomIds: [], chests: [], stairs: [],
    links: [], blocked: [], ...extra } });
const region = (cells: readonly RpgPerceivedCell[] = [], extra: Partial<RpgPerceptionRegion> = {}): RpgPerceptionRegion =>
  ({ kind: 'perception-region', snapshotId: 'snapshot-1', source, actor: at(0, 0),
    scope: { floor: 1, row: 0, column: 0, rows: 3, columns: 3 }, cells, ...extra });
const walls = (view: PerceivedMazeView) => collectWalls(view.maze, undefined, view.viewport, view.visibility);

describe('receipt-only perceived maze projection', () => {
  it('leaves unknown cells blank, remembered cells dim and observed cells bright', () => {
    const view = createPerceivedMazeView(region([visible(0, 0), remembered(0, 1)]), 'west');
    expect(view.facing).toBe('west');
    expect(view.maze.cells.map(({ row, column }) => ({ row, column }))).toEqual([{ row: 0, column: 0 }, { row: 0, column: 1 }]);
    expect(view.visibility).toEqual({ radius: 0, visible: new Set(['0:0']), explored: new Set(['0:0', '0:1']) });
    expect(isCellVisible(view.visibility, at(0, 0))).toBe(true);
    expect(isCellVisible(view.visibility, at(0, 1))).toBe(false);
    expect(isCellExplored(view.visibility, at(0, 1))).toBe(true);
    expect(isCellExplored(view.visibility, at(0, 2))).toBe(false);
    expect(view.maze.active).toEqual({ row: 0, column: 0 });
    expect(walls(view)).toEqual({ horizontal: new Set(), vertical: new Set() });
  });

  it('uses current blocked sides, not cropped links or retained old blocked edges', () => {
    const old = fact(0, 0, { edges: Object.fromEntries(directions.map(d => [d, { state: 'blocked', source }])) });
    const view = createPerceivedMazeView(region([visible(0, 0, { blocked: ['north', 'west'], links: [] }, old)]), 'south');
    expect(view.maze.cells[0].links).toEqual(['east', 'south']);
    expect(walls(view)).toEqual({ horizontal: new Set(['0:0']), vertical: new Set(['0:0']) });
  });

  it('retains all four observed walls for an isolated known floor cell', () => {
    const view = createPerceivedMazeView(region([visible(1, 1, { blocked: directions })]), 'north');
    expect(view.maze.cells[0].links).toEqual([]);
    expect(walls(view)).toEqual({ horizontal: new Set(['1:1', '2:1']), vertical: new Set(['1:1', '1:2']) });
  });

  it('draws remembered blocked edges without inventing walls for unknown edges', () => {
    const view = createPerceivedMazeView(region([remembered(1, 1, { edges: {
      west: { state: 'blocked', source }, east: { state: 'open', source },
    } })]), 'south');
    expect(view.maze.cells[0].links).toEqual(['north', 'east', 'south']);
    expect(walls(view)).toEqual({ horizontal: new Set(), vertical: new Set(['1:1']) });
  });

  it('does not resurrect a stale neighbouring wall over a currently observed exit', () => {
    const cells = [visible(0, 0), remembered(0, 1, { edges: { west: { state: 'blocked', source } } })];
    for (const ordered of [cells, [...cells].reverse()]) {
      const view = createPerceivedMazeView(region(ordered), 'east');
      expect(walls(view)).toEqual({ horizontal: new Set(), vertical: new Set() });
    }
  });

  it('keeps an unseen chest, stairs and wall at their old fact despite unseen world mutation', () => {
    const worldCell = { chests: [chest(1, 1)], stairs: ['down'] as RpgStair[],
      edges: { west: { state: 'blocked' as 'blocked' | 'open', source } } };
    const input = region([remembered(1, 1, structuredClone(worldCell))]);
    const before = createPerceivedMazeView(input, 'south');
    worldCell.chests[0].opened = true;
    worldCell.chests.length = 0;
    worldCell.stairs.length = 0;
    worldCell.edges.west.state = 'open';
    expect(createPerceivedMazeView(input, 'south')).toEqual(before);
    expect(before.chests).toEqual([{ row: 1, column: 1 }]);
    expect(before.maze.end).toEqual({ row: 1, column: 1 });
    expect(walls(before).vertical).toEqual(new Set(['1:1']));
  });

  it.each(['up', 'town'] as const)('keeps remembered %s stairs and unopened chests', stair => {
    const view = createPerceivedMazeView(region([
      remembered(0, 1, { stairs: [stair], chests: [chest(0, 1), { ...chest(0, 1), id: 'second' }] }),
      remembered(1, 2, { stairs: ['down'], chests: [chest(1, 2, true)] }),
    ]), 'south');
    expect(view.maze.start).toEqual({ row: 0, column: 1 });
    expect(view.maze.end).toEqual({ row: 1, column: 2 });
    expect(view.chests).toEqual([{ row: 0, column: 1 }]);
    expect(view.visibility.visible.size).toBe(0);
  });

  it('uses newly observed stairs/chests and removes old markers after a new observation', () => {
    const old = fact(0, 0, { stairs: ['town', 'down'], chests: [chest(0, 0)] });
    const view = createPerceivedMazeView(region([
      visible(0, 0, { chests: [chest(0, 0, true)] }, old),
      visible(1, 1, { stairs: ['down'], chests: [chest(1, 1)] }),
    ]), 'south');
    expect(view.chests).toEqual([{ row: 1, column: 1 }]);
    expect(isInViewport(view.maze.start, view.viewport)).toBe(false);
    expect(view.maze.end).toEqual({ row: 1, column: 1 });
  });

  it('never reads hidden world/layout/role getters or unnecessary receipt metadata', () => {
    const old = fact(0, 0);
    const observation: RpgObservedCell = { address: at(0, 0), roomIds: [], chests: [], stairs: [], blocked: [], links: [] };
    const input = region([{ state: 'visible', fact: old, observation }, remembered(0, 1)]);
    const poison = (object: object, keys: string[]) => {
      for (const key of keys) Object.defineProperty(object, key, { enumerable: true, get() { throw new Error(`hidden ${key}`); } });
    };
    for (const object of [input, old, observation, input.cells[1].fact]) {
      poison(object, ['game', 'world', 'maze', 'layout', 'seed', 'mainPath', 'tints', 'roomRole', 'roomIds', 'source']);
    }
    poison(old, ['address', 'edges', 'chests', 'stairs']);
    poison(observation, ['links']);
    const view = createPerceivedMazeView(input, 'north');
    expect(view.maze.cells).toHaveLength(2);
    expect(Object.keys(view.maze).sort()).toEqual(['active', 'cells', 'columns', 'end', 'rows', 'start', 'visited']);
    expect(Object.keys(view.maze.cells[0]).sort()).toEqual(['column', 'links', 'row']);
  });

  it('does not mutate frozen input or retain mutable input aliases', () => {
    const input = region([visible(0, 0, { chests: [chest(0, 0)], stairs: ['town', 'down'] })]);
    const before = structuredClone(input);
    const freeze = (value: unknown) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(input);
    const view = createPerceivedMazeView(input, 'east');
    expect(input).toEqual(before);
    view.maze.cells[0].row++;
    view.maze.cells[0].links.length = 0;
    view.chests[0].column++;
    view.maze.start.row++;
    view.maze.end.column++;
    view.maze.active.column++;
    view.viewport.rowStart++;
    view.origin.row++;
    view.visibility.visible.clear();
    expect(input).toEqual(before);
    expect(createPerceivedMazeView(input, 'east').maze.active).toEqual({ row: 0, column: 0 });
  });

  it('returns a blank bounded view for an empty region', () => {
    const view = createPerceivedMazeView(region(), 'south');
    expect(view.maze.cells).toEqual([]);
    expect(view.chests).toEqual([]);
    expect(view.visibility.explored.size).toBe(0);
    for (const marker of [view.maze.start, view.maze.end, view.maze.active]) {
      expect(isInViewport(marker, view.viewport)).toBe(false);
      expect(isCellExplored(view.visibility, marker)).toBe(false);
    }
    expect(walls(view)).toEqual({ horizontal: new Set(), vertical: new Set() });
  });

  it.each([
    [64, 16], [16, 64], [32, 32],
  ])('accepts a full %s by %s scope without allocating unknown world cells', (rows, columns) => {
    const cells = Array.from({ length: rows * columns }, (_, index) => remembered(
      1_000_000 + Math.floor(index / columns), 2_000_000 + index % columns,
    ));
    const view = createPerceivedMazeView(region(cells, {
      scope: { floor: 1, row: 1_000_000, column: 2_000_000, rows, columns },
    }), 'south');
    expect(view.maze.cells).toHaveLength(1024);
    expect(view.maze.rows).toBe(rows);
    expect(view.maze.columns).toBe(columns);
    expect(view.visibility.explored.size).toBe(1024);
    expect(view.visibility.visible.size).toBe(0);
    for (const viewport of [view.viewport, undefined]) {
      const cells = linkMap(view.maze);
      const get = vi.spyOn(cells, 'get');
      expect(collectWalls(view.maze, cells, viewport, view.visibility)).toEqual({ horizontal: new Set(), vertical: new Set() });
      expect(get).toHaveBeenCalledTimes(1024);
    }
  });

  it.each([
    ['remembered actor', [remembered(0, 0)], at(0, 0)],
    ['other-floor actor', [visible(0, 0)], at(0, 0, 2)],
    ['actor outside scope', [visible(0, 0)], at(100, 100)],
  ] as const)('hides the %s', (_label, cells, actor) => {
    const view = createPerceivedMazeView(region(cells, { actor }), 'south');
    expect(isInViewport(view.maze.active, view.viewport)).toBe(false);
  });

  it('restricts cells and markers to the requested floor and rectangle', () => {
    const view = createPerceivedMazeView(region([
      remembered(4, 5, { address: at(4, 5, 2), stairs: ['up'] }),
      visible(4, 6, { address: at(4, 6, 2) }),
      remembered(4, 5, { stairs: ['down'], chests: [chest(4, 5)] }),
      visible(0, 0, { stairs: ['down'], chests: [chest(0, 0)] }),
    ], { scope: { floor: 2, row: 4, column: 5, rows: 2, columns: 2 }, actor: at(4, 6) }), 'south');
    expect(view.origin).toEqual({ row: 4, column: 5 });
    expect(view.viewport).toEqual({ rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 2, rows: 2, columns: 2 });
    expect(view.maze).toMatchObject({ rows: 2, columns: 2, start: { row: 0, column: 0 } });
    expect(view.maze.cells).toHaveLength(2);
    expect(view.chests).toEqual([]);
    expect(view.maze.end).toEqual({ row: -1, column: -1 });
    expect(view.maze.active).toEqual({ row: -1, column: -1 });
  });

  it.each([
    [0, 0], [1_000_000, 2_000_000], [Number.MAX_SAFE_INTEGER - 64, Number.MAX_SAFE_INTEGER - 16],
  ])('projects identical local geometry at world origin %s, %s', (row, column) => {
    const project = (r: number, c: number) => createPerceivedMazeView(region([
      visible(r, c, { blocked: ['north', 'west'], stairs: ['town'] }),
      remembered(r, c + 1, { edges: { west: { state: 'blocked', source }, east: { state: 'blocked', source } } }),
      remembered(r + 1, c + 1, { stairs: ['down'], chests: [chest(r + 1, c + 1)] }),
      visible(r + 63, c + 15, { blocked: directions }),
    ], { scope: { floor: 1, row: r, column: c, rows: 64, columns: 16 }, actor: at(r + 63, c + 15) }), 'east');
    const view = project(row, column);
    const { origin, ...geometry } = view;
    const { origin: baselineOrigin, ...baseline } = project(0, 0);
    expect(origin).toEqual({ row, column });
    expect(baselineOrigin).toEqual({ row: 0, column: 0 });
    expect(geometry).toEqual(baseline);
    expect(view.viewport).toEqual({ rowStart: 0, rowEnd: 64, columnStart: 0, columnEnd: 16, rows: 64, columns: 16 });
    expect(view.maze).toMatchObject({ rows: 64, columns: 16, active: { row: 63, column: 15 },
      start: { row: 0, column: 0 }, end: { row: 1, column: 1 } });
    expect(view.chests).toEqual([{ row: 1, column: 1 }]);
    expect(view.visibility).toEqual({ radius: 0, visible: new Set(['0:0', '63:15']), explored: new Set(['0:0', '0:1', '1:1', '63:15']) });
    // Future hit testing adds origin only after validating a scope-local position.
    expect({ row: origin.row + view.maze.active.row, column: origin.column + view.maze.active.column })
      .toEqual({ row: row + 63, column: column + 15 });
    for (const viewport of [view.viewport, undefined]) {
      const cells = linkMap(view.maze);
      const get = vi.spyOn(cells, 'get');
      const network = collectWalls(view.maze, cells, viewport, view.visibility);
      expect(network).toEqual(walls(project(0, 0)));
      expect(network.vertical.has('0:1')).toBe(false);
      expect(get).toHaveBeenCalledTimes(1024);
      const rect = vi.fn();
      const floorCells = appendMazeFloorPath({ rect } as unknown as CanvasRenderingContext2D,
        view.maze, 10, 0, 0, viewport, cell => isCellVisible(view.visibility, cell));
      expect(floorCells).toEqual(new Set([0, 1023]));
      expect(rect.mock.calls).toEqual([[0, 0, 10, 10], [150, 630, 10, 10]]);
    }
  });

  it('keeps absent markers at the same sentinel after translating an empty scope', () => {
    const scope = { floor: 1, row: Number.MAX_SAFE_INTEGER - 3, column: Number.MAX_SAFE_INTEGER - 3, rows: 3, columns: 3 };
    const { origin, ...view } = createPerceivedMazeView(region([], { scope }), 'south');
    const { origin: baselineOrigin, ...baseline } = createPerceivedMazeView(region(), 'south');
    expect(origin).toEqual({ row: scope.row, column: scope.column });
    expect(baselineOrigin).toEqual({ row: 0, column: 0 });
    expect(view).toEqual(baseline);
    for (const marker of [view.maze.start, view.maze.end, view.maze.active]) expect(marker).toEqual({ row: -1, column: -1 });
  });

  it.each([
    { rows: 65 }, { columns: 65 }, { rows: 33, columns: 32 }, { rows: 0 }, { columns: -1 },
    { row: -1 }, { column: 0.5 }, { row: Number.MAX_SAFE_INTEGER }, { columns: Infinity },
  ])('rejects invalid scope bounds before reading any cells: %j', bounds => {
    const input = region([], { scope: { floor: 1, row: 0, column: 0, rows: 2, columns: 2, ...bounds } });
    Object.defineProperty(input, 'cells', { get() { throw new Error('cells must not be read'); } });
    expect(() => createPerceivedMazeView(input, 'south')).toThrow(RangeError);
  });

  it('rejects oversized cell lists before iterating', () => {
    const input = region(Array.from({ length: 1025 }, () => remembered(0, 0)), {
      scope: { floor: 1, row: 0, column: 0, rows: 32, columns: 32 },
    });
    expect(() => createPerceivedMazeView(input, 'south')).toThrow(RangeError);
  });
});

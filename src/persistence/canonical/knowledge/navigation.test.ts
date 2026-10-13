import { describe, expect, it, vi } from 'vitest';
import { lineCells } from '../../../hooks/canonicalHooks.test-support';
import { findKnownRoute, navigationScope, NAVIGATION_CELLS, NAVIGATION_STEPS } from './navigation';
import { readKnowledgeRegion, type KnowledgeRegion } from './region';
import { knowledgeFixture } from './region.test-support';
import type { Direction, GridPosition } from '../../../domain/types';
import type { RememberedCell } from './types';

describe('snapshot bounded earned navigation', () => {
  it('validates knowledge once and follows only earned passages, including remembered cells', async () => {
    const f = knowledgeFixture(), cells = lineCells();
    await f.observe(cells);
    await f.observe([{ ...cells[0], edges: {} }]);
    const witness = vi.spyOn(f.pages, 'witness'), writes = f.writes.length;
    const scope = navigationScope(1, cells[0].world, cells[4].world)!;
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), scope);
    expect(region.cells.filter(cell => cell.state === 'remembered')).toHaveLength(4);
    expect(findKnownRoute(region, cells[0].at, cells[4].world)).toEqual({ complete: true,
      steps: cells.slice(1).map((cell, i) => ({ from: cells[i].at, to: cell.at, direction: 'east' })) });
    expect(witness).toHaveBeenCalledTimes(1);
    expect(f.writes).toHaveLength(writes);
    expect(f.reads.every(key => key.startsWith('perception/'))).toBe(true);
  });

  it.each(['unknown-target', 'unknown-edge', 'known-wall', 'one-way', 'foreign-floor', 'nonadjacent'])('refuses %s without reconstructing geometry', async kind => {
    const f = knowledgeFixture(), cells = lineCells(); await f.observe(cells);
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), navigationScope(1, cells[0].world, cells[4].world)!);
    if (kind === 'unknown-target') region.cells.pop();
    if (kind === 'unknown-edge') delete region.cells[1].cell.edges.east;
    if (kind === 'known-wall') region.cells[1].cell.edges.east!.target = null;
    if (kind === 'one-way') delete region.cells[2].cell.edges.west;
    if (kind === 'foreign-floor') region.cells[2].cell.at.level = 2;
    if (kind === 'nonadjacent') region.cells[2].cell.world.column += 20;
    expect(findKnownRoute(region, cells[0].at, cells[4].world)).toBeNull();
  });

  it('caps coordinates at 512 and axes at 64, and refuses distant or invalid targets', () => {
    for (const target of [{ row: 0, column: 63 }, { row: -15, column: -15 }, { row: 0, column: 0 }]) {
      const scope = navigationScope(1, { row: 0, column: 0 }, target)!;
      expect(scope.rows * scope.columns).toBeLessThanOrEqual(NAVIGATION_CELLS);
      expect(Math.max(scope.rows, scope.columns)).toBeLessThanOrEqual(64);
      expect(target.row).toBeGreaterThanOrEqual(scope.row); expect(target.row).toBeLessThan(scope.row + scope.rows);
      expect(target.column).toBeGreaterThanOrEqual(scope.column); expect(target.column).toBeLessThan(scope.column + scope.columns);
    }
    expect(navigationScope(1, { row: 0, column: 0 }, { row: 64, column: 0 })).toBeNull();
    expect(navigationScope(1, { row: 0, column: 0 }, { row: 32, column: 32 })).toBeNull();
    expect(() => navigationScope(1, { row: 0, column: 0 }, { row: NaN, column: 0 })).toThrow();
  });

  it('returns at most 64 steps without claiming arrival at a more distant known target', () => {
    const coordinates: GridPosition[] = Array.from({ length: 10 }, (_, row) =>
      Array.from({ length: 10 }, (_, column) => ({ row, column: row % 2 ? 9 - column : column }))).flat();
    const source = { sequence: 1, id: 'observed', index: 0 };
    const cells: RememberedCell[] = coordinates.map((world, i) => ({ at: { level: 1, cell: { spaceId: 'room', row: world.row, column: world.column } },
      world, edges: {}, chests: [], stairs: [], source: { ...source, index: i } }));
    for (let i = 1; i < cells.length; i++) {
      const before = cells[i - 1], next = cells[i];
      const d: Direction = before.world.row !== next.world.row ? 'south' : before.world.column < next.world.column ? 'east' : 'west';
      const reverse: Direction = d === 'south' ? 'north' : d === 'east' ? 'west' : 'east';
      before.edges[d] = { target: next.at, source }; next.edges[reverse] = { target: before.at, source };
    }
    const region: KnowledgeRegion = { scope: { floor: 1, row: 0, column: 0, rows: 10, columns: 10 }, actor: cells[0].world,
      cells: cells.map(cell => ({ state: 'remembered', cell })) };
    const route = findKnownRoute(region, cells[0].at, cells.at(-1)!.world)!;
    expect(route.steps).toHaveLength(NAVIGATION_STEPS);
    expect(route.complete).toBe(false);
    expect(route.steps.at(-1)?.to).toEqual(cells[64].at);
    expect(findKnownRoute(region, cells[0].at, cells[0].world)).toEqual({ steps: [], complete: true });
    expect(() => findKnownRoute({ ...region, cells: [...region.cells, region.cells[0]] }, cells[0].at, cells[0].world)).toThrow('duplicate');
    expect(() => findKnownRoute({ ...region, cells: Array(513).fill(region.cells[0]) }, cells[0].at, cells[0].world)).toThrow('bound');
  });
});

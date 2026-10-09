import { describe, expect, it } from 'vitest';
import { opposite } from '../../domain/maze/movement';
import type { Direction } from '../../domain/types';
import { boundary, childBounds, passageBounds, reservedBounds, world } from '../../domain/expedition/topology/geometry';
import type { SpaceSpec } from '../../domain/expedition/types';
import type { Occupancy } from '../../domain/expedition/topology/types';
import { boundsBuckets, MAX_BUCKET_ENTRIES, neighborhood, validateBucket } from './buckets';
import { recordBytes, type TopologyTransaction } from './database';
import { PagedOccupancy } from './reader';

const directions: Direction[] = ['north', 'east', 'south', 'west'];
function spec(rows: number, columns: number): SpaceSpec {
  return { id: 'source', kind: 'room', name: 'Source', seed: 0, origin: { row: -41, column: 19 }, rows, columns, openings: [], chests: [] };
}

describe('bounded paged topology occupancy', () => {
  it('proves all candidate, passage and reservation extents for every dimension/gap/direction', () => {
    let checked = 0;
    for (const source of [spec(5, 15), spec(15, 5), spec(9, 9)]) for (const direction of directions) {
      const point = world(source, boundary(source, direction));
      const candidates = [childBounds(source, direction, 5, 5, 1)];
      for (let rows = 7; rows <= 15; rows += 2) for (let columns = 7; columns <= 15; columns += 2) {
        for (let gap = 2; gap <= 7; gap++) candidates.push(childBounds(source, direction, rows, columns, gap));
      }
      for (const candidate of candidates) {
        const room = { ...source, origin: { row: candidate.row, column: candidate.column }, rows: candidate.rows, columns: candidate.columns };
        const queries = [candidate, passageBounds(source, candidate, direction)];
        for (const next of directions.filter(value => value !== opposite(direction))) {
          queries.push(reservedBounds(room, { direction: next, fallback: childBounds(room, next, 5, 5, 1) }));
        }
        for (const query of queries) {
          expect(Math.max(Math.abs(query.row - point.row), Math.abs(query.row + query.rows - 1 - point.row),
            Math.abs(query.column - point.column), Math.abs(query.column + query.columns - 1 - point.column))).toBeLessThanOrEqual(28);
          expect(boundsBuckets(query).length).toBeLessThanOrEqual(9);
          checked++;
        }
      }
    }
    expect(checked).toBe(9060);
  });

  it('covers inclusive +/-32 with exactly 25 pages for every positive/negative bin alignment', () => {
    for (let row = -32; row < 32; row++) for (let column = -32; column < 32; column++) {
      const bins = new Set(neighborhood({ row, column }).map(value => JSON.stringify(value)));
      expect(bins.size).toBe(25);
      for (const dr of [-32, 32]) for (const dc of [-32, 32]) {
        expect(bins.has(JSON.stringify([Math.floor((row + dr) / 16), Math.floor((column + dc) / 16)]))).toBe(true);
      }
    }
  });

  it('bounds each bin to 256 disjoint entries while allowing arbitrary rectangle alignment', () => {
    const entries: Occupancy[] = Array.from({ length: MAX_BUCKET_ENTRIES }, (_, index) => ({
      id: `cell-${index}`, kind: 'space', bounds: { row: Math.floor(index / 16), column: index % 16, rows: 1, columns: 1 },
    }));
    expect(() => validateBucket([0, 0], entries)).not.toThrow();
    expect(() => validateBucket([0, 0], [...entries, { ...entries[0], id: 'overflow' }])).toThrow(/capacity/);
    expect(() => validateBucket([0, 0], [entries[0], { ...entries[0], id: 'overlap' }])).toThrow(/Overlapping/);
    expect(() => validateBucket([-1, -1], [{ id: 'crossing', kind: 'space', bounds: { row: -3, column: -7, rows: 15, columns: 11 } }])).not.toThrow();
    expect(() => boundsBuckets({ row: 0, column: 0, rows: 33, columns: 1 })).toThrow();
  });

  it('fails closed outside prefetched bins and rejects inconsistent replicated entries', async () => {
    const entry: Occupancy = { id: 'crossing', kind: 'space', bounds: { row: 15, column: 0, rows: 2, columns: 1 } };
    const tx = { get: async (_store: string, key: number[]) => key[1] === 0 ? [entry] : [] } as unknown as TopologyTransaction;
    const inconsistent = new PagedOccupancy();
    await expect(inconsistent.fetch(tx, 'slot', [[0, 0], [1, 0]])).rejects.toThrow(/Inconsistent/);
    const page = new PagedOccupancy();
    await page.fetch(tx, 'slot', [[0, 0]]);
    expect(() => page.occupied({ row: 15, column: 0, rows: 2, columns: 1 })).toThrow(/prefetched/);
    expect(page.occupied({ row: 15, column: 0, rows: 1, columns: 1 })).toBe(true);
    expect(page.occupied({ row: 15, column: 0, rows: 1, columns: 1 }, 'crossing')).toBe(false);
  });

  it('counts UTF-8 serialized bytes and rejects unsafe coordinate neighborhoods', () => {
    const serialized = JSON.stringify(['spaces', 'key', { name: '\u4e16\u754c' }]);
    expect(recordBytes('spaces', 'key', { name: '\u4e16\u754c' })).toBe(new TextEncoder().encode(serialized).length);
    expect(recordBytes('spaces', 'key', { name: '\u4e16\u754c' })).toBeGreaterThan(serialized.length);
    expect(recordBytes('spaces', 'key', undefined)).toBe(0);
    expect(() => neighborhood({ row: Number.MAX_SAFE_INTEGER, column: 0 })).toThrow(/safe/);
  });

  it('enforces the prefetch cap before a 26th page read', async () => {
    let reads = 0;
    const tx = { get: async () => { reads++; return []; } } as unknown as TopologyTransaction;
    const pages = new PagedOccupancy();
    await pages.fetch(tx, 'slot', neighborhood({ row: 0, column: 0 }));
    await expect(pages.fetch(tx, 'slot', [[3, 3]])).rejects.toThrow(/page budget/);
    expect(reads).toBe(25);
  });
});

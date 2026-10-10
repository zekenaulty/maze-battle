import { describe, expect, it, vi } from 'vitest';
import { SpaceResidency } from './residency';
import { sparseTestGeometry, storageFixture, testGeometry, testSpace } from './storage.testSupport';
import type { SpaceGeometry, SpaceSpec } from './types';

describe('SpaceResidency', () => {
  it('evicts the least recently used space under a total cell budget', () => {
    const materialize = vi.fn(testGeometry);
    const cache = new SpaceResidency(8, materialize);
    const a = testSpace('a');
    const b = testSpace('b');
    const first = cache.get(a);
    cache.get(b);
    expect(cache.get(structuredClone(a))).toBe(first);
    cache.get(testSpace('c'));
    expect(cache.get(a)).toBe(first);
    expect(cache.stats()).toEqual({ residentSpaces: 2, residentCells: 8, loads: 3, evictions: 1 });
    cache.get(b);
    expect(materialize.mock.calls.map(([spec]) => spec.id)).toEqual(['a', 'b', 'c', 'b']);
  });

  it('evicts as many variable-sized spaces as needed, and fits a whole-budget space', () => {
    const cache = new SpaceResidency(10, testGeometry);
    cache.get(testSpace('a', 1, 2));
    cache.get(testSpace('b', 1, 3));
    cache.get(testSpace('c', 1, 5));
    cache.get(testSpace('d', 2, 4));
    expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: 8, loads: 4, evictions: 3 });
    cache.get(testSpace('e', 2, 5));
    expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: 10, loads: 5, evictions: 4 });
    expect(new SpaceResidency(1, testGeometry).get(testSpace('one', 1, 1)).cells).toHaveLength(1);
  });

  it('allows omitted obstacle cells while charging the entire bounding rectangle', () => {
    const materialize = vi.fn(sparseTestGeometry);
    const cache = new SpaceResidency(6, materialize);
    const a = testSpace('a');
    const first = cache.get(a);
    expect(first.cells).toHaveLength(3);
    expect(first.cells.some(cell => cell.row === 1 && cell.column === 0)).toBe(false);
    expect(first.cells.find(cell => cell.row === 0 && cell.column === 0)!.links).toEqual(['east']);
    expect(first.cells.find(cell => cell.row === 0 && cell.column === 1)!.links).toEqual(['south', 'west']);
    cache.get(testSpace('b'));
    expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: 4, loads: 2, evictions: 1 });
    expect(cache.get(a)).toEqual(first);
    expect(materialize).toHaveBeenCalledTimes(3);
  });

  it('accepts a single walkable cell and sparse interior pillars with reciprocal routes', () => {
    const one = new SpaceResidency(4, spec => testGeometry(spec, [
      { row: 0, column: 1 }, { row: 1, column: 0 }, { row: 1, column: 1 },
    ]));
    expect(one.get(testSpace()).cells).toEqual([{ row: 0, column: 0, links: [] }]);
    expect(one.stats().residentCells).toBe(4);
    const ring = new SpaceResidency(9, spec => testGeometry(spec, [{ row: 1, column: 1 }]));
    expect(ring.get(testSpace('pillar', 3, 3)).cells).toHaveLength(8);
    expect(ring.stats().residentCells).toBe(9);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects bad budget %s', budget => {
    expect(() => new SpaceResidency(budget, testGeometry)).toThrow(RangeError);
  });

  it.each([[3, 3], [0, 1], [1.5, 2], [NaN, 1], [1, Infinity], [Number.MAX_SAFE_INTEGER, 2]])(
    'rejects an invalid or oversized %sx%s space without materialization or eviction', (rows, columns) => {
      const materialize = vi.fn(testGeometry);
      const cache = new SpaceResidency(4, materialize);
      const a = testSpace();
      const before = cache.get(a);
      expect(() => cache.get(testSpace('bad', rows, columns))).toThrow('cannot fit');
      expect(cache.get(a)).toBe(before);
      expect(materialize).toHaveBeenCalledTimes(1);
      expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: 4, loads: 1, evictions: 0 });
    },
  );

  const drifts: [string, (spec: SpaceSpec) => void][] = [
    ['seed', s => { s.seed++; }], ['kind', s => { s.kind = 'passage'; }],
    ['name', s => { s.name = 'renamed'; }], ['origin', s => { s.origin.row++; }],
    ['dimensions', s => { s.rows++; }], ['chest id', s => { s.chests[0].id = 'other'; }],
    ['chest location', s => { s.chests[0].cell.column = 0; }], ['opening id', s => { s.openings[0].id = 'other'; }],
    ['opening location', s => { s.openings[0].cell.row++; s.chests[0].cell.column = 0; }],
    ['opening direction', s => { s.openings[0].direction = 'north'; }],
    ['opening target', s => { s.openings[0].destination.spaceId = 'other'; }],
  ];
  it.each(drifts)('replaces the cached identity after %s drift', (_label, change) => {
    const spec = storageFixture().plan.spaces[0];
    const cache = new SpaceResidency(20, testGeometry);
    const first = cache.get(spec);
    change(spec);
    expect(cache.get(spec)).not.toBe(first);
    expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: spec.rows * spec.columns, loads: 2, evictions: 1 });
  });

  it('ignores property insertion order, and snapshots stats', () => {
    const cache = new SpaceResidency(4, testGeometry);
    const spec = testSpace();
    const first = cache.get(spec);
    expect(cache.get(Object.fromEntries(Object.entries(spec).reverse()) as unknown as SpaceSpec)).toBe(first);
    cache.stats().residentCells = 999;
    expect(cache.stats().residentCells).toBe(4);
  });

  it('keeps residents and their LRU order when materialization throws', () => {
    const cache = new SpaceResidency(8, spec => {
      if (spec.seed === 99) throw new Error('generation failed');
      return testGeometry(spec);
    });
    const a = testSpace('a');
    cache.get(a);
    const b = cache.get(testSpace('b'));
    expect(() => cache.get({ ...a, seed: 99 })).toThrow('generation failed');
    expect(cache.stats()).toEqual({ residentSpaces: 2, residentCells: 8, loads: 2, evictions: 0 });
    cache.get(testSpace('c'));
    expect(cache.get(testSpace('b'))).toBe(b);
  });

  const invalid: [string, (geometry: SpaceGeometry) => void][] = [
    ['identity', g => { g.spaceId = 'other'; }], ['dimensions', g => { g.rows++; }],
    ['empty geometry', g => { g.cells = []; }], ['excess cells', g => { g.cells.push(g.cells[0]); }],
    ['duplicate cells', g => { g.cells[1] = g.cells[0]; }],
    ['link into an omitted obstacle', g => { g.cells.pop(); }],
    ['nonreciprocal link', g => { g.cells[1].links = g.cells[1].links.filter(link => link !== 'west'); }],
    ['out-of-bounds link', g => { g.cells[0].links.push('north'); }],
    ['east boundary link wrapping into the next row', g => { g.cells[1].links.push('east'); g.cells[2].links.push('west'); }],
    ['cell bounds', g => { g.cells[0].row = -1; }], ['bad links', g => { Object.assign(g.cells[0], { links: ['up'] }); }],
    ['sparse links', g => { g.cells[0].links = new Array(1); }],
    ['uncloneable result', g => { Object.assign(g, { extra: () => undefined }); }],
  ];
  it.each(invalid)('retains valid snapshots when replacement has %s', (_name, corrupt) => {
    const spec = testSpace();
    const cache = new SpaceResidency(4, input => {
      const geometry = testGeometry(input);
      if (input.seed === 99) corrupt(geometry);
      return geometry;
    });
    const first = cache.get(spec);
    expect(() => cache.get({ ...spec, seed: 99 })).toThrow();
    expect(cache.get(spec)).toBe(first);
    expect(cache.stats()).toEqual({ residentSpaces: 1, residentCells: 4, loads: 1, evictions: 0 });
  });

  it('owns immutable geometry independently of callers and materializers across regeneration', () => {
    const spec = testSpace();
    let output = testGeometry(spec);
    const cache = new SpaceResidency(4, input => {
      expect(input).not.toBe(spec);
      expect(Object.isFrozen(input)).toBe(true);
      output = testGeometry(input);
      return output;
    });
    const first = cache.get(spec);
    expect(Object.isFrozen(first.cells[0].links)).toBe(true);
    expect(() => first.cells[0].links.push('north')).toThrow();
    output.cells[0].links.push('south');
    expect(first.cells[0].links).toEqual(['east', 'south']);
    expect(Object.isFrozen(spec)).toBe(false);
    cache.get(testSpace('other'));
    const regenerated = cache.get(spec);
    expect(regenerated).not.toBe(first);
    expect(regenerated).toEqual(first);
  });

  it('clear releases all cells but keeps lifetime counters', () => {
    const cache = new SpaceResidency(4, testGeometry);
    const first = cache.get(testSpace());
    cache.clear();
    cache.clear();
    expect(cache.stats()).toEqual({ residentSpaces: 0, residentCells: 0, loads: 1, evictions: 0 });
    expect(cache.get(testSpace())).not.toBe(first);
  });
});

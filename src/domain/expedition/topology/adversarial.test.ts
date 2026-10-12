import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { createTopology, expandTopology } from './generation';
import { MemoryTopology } from './memoryTopology';
import { MAX_QUERY_BUCKETS, MAX_QUERY_ENTRY_CHECKS, OccupancyIndex } from './occupancy';
import { reservedBounds } from './geometry';
import type { TopologyRecipe } from './types';

const recipe = (seed = 0, level = 19): TopologyRecipe => ({ version: 'spaces-v2', worldId: 'audit', floorId: 'one', seed, level });
const seeds = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff,
  ...Array.from({ length: 59 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0)];

// Keep every hot-loop check without rebuilding Vitest's assertion state a million times.
function assertAtMost(actual: unknown, maximum: unknown, context: string) {
  assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${context}: numeric actual required`);
  assert.ok(typeof maximum === 'number' || typeof maximum === 'bigint', `${context}: numeric maximum required`);
  assert.ok(actual <= maximum, `${context}: expected ${actual} <= ${maximum}`);
}

describe('topology adversarial qualification', () => {
  it('keeps upper-bound checks strict about equality, overflow, NaN and nonnumeric inputs', () => {
    for (const [actual, maximum] of [[0, 0], [1, 2], [-Infinity, 0], [Infinity, Infinity], [1n, 2n], [1n, 2]]) {
      expect(() => assertAtMost(actual, maximum, 'boundary')).not.toThrow();
    }
    for (const [actual, maximum] of [[2, 1], [NaN, 1], [1, NaN], [Infinity, 1], ['1', 2], [1, '2'], [null, 2], [1, undefined]]) {
      expect(() => assertAtMost(actual, maximum, 'boundary')).toThrow();
    }
  });

  it('rejects overlapping index entries before a bucket can grow without bound', () => {
    const index = new OccupancyIndex();
    const bounds = { row: 0, column: 0, rows: 1, columns: 1 };
    index.add({ id: 'first', kind: 'space', bounds });
    expect(() => index.add({ id: 'overlap', kind: 'reservation', bounds })).toThrow(/overlap/i);
    expect(index.values()).toHaveLength(1);
  });

  it('does not expose mutation of the host occupancy ledger', () => {
    const store = new MemoryTopology(recipe());
    expect('add' in store.occupancy).toBe(false);
    expect('remove' in store.occupancy).toBe(false);
    const values = store.occupancy.values();
    values[0].bounds.row = 10000;
    values.pop();
    const work = store.occupancy.work;
    work.entryChecks = -1;
    expect(store.occupancy.values()[0].bounds.row).toBe(0);
    expect(store.occupancy.work.entryChecks).toBeGreaterThanOrEqual(0);
  });

  it('bounds a dense negative-coordinate empty query independently of distant world size', () => {
    const index = new OccupancyIndex();
    const query = { row: -17, column: -17, rows: 32, columns: 32 };
    for (let row = -32; row < 16; row++) {
      for (let column = -32; column < 16; column++) {
        if (row >= -17 && row < 15 && column >= -17 && column < 15) continue;
        index.add({ id: `${row}:${column}`, kind: 'space', bounds: { row, column, rows: 1, columns: 1 } });
      }
    }
    const measure = () => {
      const before = { ...index.work };
      expect(index.occupied(query)).toBe(false);
      return { buckets: index.work.bucketReads - before.bucketReads, checks: index.work.entryChecks - before.entryChecks };
    };
    const first = measure();
    expect(first).toEqual({ buckets: 9, checks: 1280 });
    for (let i = 0; i < 1000; i++) {
      index.add({ id: `distant-${i}`, kind: 'space', bounds: { row: 1000 + i * 32, column: 1000, rows: 1, columns: 1 } });
    }
    expect(measure()).toEqual(first);
    expect(first.buckets).toBeLessThanOrEqual(MAX_QUERY_BUCKETS);
    expect(first.checks).toBeLessThanOrEqual(MAX_QUERY_ENTRY_CHECKS);
  });

  it('rejects oversized occupancy queries and leaves a rejected insertion unchanged', () => {
    const index = new OccupancyIndex();
    const first = { id: 'one', kind: 'space' as const, bounds: { row: 0, column: 0, rows: 5, columns: 5 } };
    index.add(first);
    const before = index.values();
    for (const bounds of [
      { row: 0, column: 0, rows: 33, columns: 1 }, { row: NaN, column: 0, rows: 1, columns: 1 },
      { row: 0, column: 0, rows: 1, columns: 0 }, { row: Number.MAX_SAFE_INTEGER, column: 0, rows: 1, columns: 1 },
    ]) {
      expect(() => index.occupied(bounds)).toThrow(/bounded/i);
      expect(() => index.add({ ...first, id: 'invalid', bounds })).toThrow(/bounded/i);
      expect(index.values()).toEqual(before);
    }
    index.remove('one');
    expect(index.occupied(first.bounds)).toBe(false);
    index.add({ ...first, id: 'replacement' });
    expect(index.occupied(first.bounds, 'replacement')).toBe(false);
  });

  it.each([19, 80, 1000])('measures finite growth and collision work at level %s', (level) => {
    const results: { seed: number; rooms: number; reason: string; checks: number; buckets: number; singletonPassages: number }[] = [];
    for (const seed of seeds) {
      const store = new MemoryTopology(recipe(seed, level));
      let checks = 0;
      let buckets = 0;
      let singletonPassages = 0;
      while (!store.header().seal) {
        const header = store.header();
        const socket = store.socket(header.nextSocket)!;
        const context = `level ${level}, seed ${seed}, revision ${header.revision}`;
        assert.equal(store.occupied(reservedBounds(store.space(socket.source.spaceId)!.spec, socket), socket.id), false, `${context}: reservation`);
        const before = store.occupancy.work;
        const proposal = expandTopology(store, header.revision, `step-${header.revision}`);
        if (proposal.status !== 'ready') throw new Error('Expected unsealed frontier');
        singletonPassages += proposal.delta.spaces.filter(space =>
          space.spec.kind === 'passage' && space.spec.rows * space.spec.columns === 1).length;
        const queries = store.occupancy.work.queries - before.queries;
        assertAtMost(queries, proposal.delta.work.occupancyQueries, `${context}: query budget`);
        assertAtMost(proposal.delta.work.occupancyQueries, 20, `${context}: proposal query limit`);
        assertAtMost(store.occupancy.work.bucketReads - before.bucketReads, queries * MAX_QUERY_BUCKETS, `${context}: bucket budget`);
        assertAtMost(store.occupancy.work.entryChecks - before.entryChecks, queries * MAX_QUERY_ENTRY_CHECKS, `${context}: entry budget`);
        checks = Math.max(checks, store.occupancy.work.entryChecks - before.entryChecks);
        buckets = Math.max(buckets, store.occupancy.work.bucketReads - before.bucketReads);
        store.commit(proposal.delta);
        const next = store.header();
        assertAtMost(next.rooms + next.socketCount - next.nextSocket, header.roomBudget, `${context}: room budget`);
        assert.equal(next.rooms, header.rooms + 1, `${context}: room increment`);
        assert.equal(next.nextSocket, header.nextSocket + 1, `${context}: socket increment`);
      }
      const header = store.header();
      expect(header.nextSocket).toBe(header.socketCount);
      expect(header.seal!.reason).toBe(header.rooms === header.roomBudget ? 'budget' : 'spatial-limit');
      expect(store.occupancy.values().every(entry => entry.kind === 'space')).toBe(true);
      expect(store.spaceIds()).toHaveLength(2 * header.rooms - 1);
      expect(expandTopology(store, header.revision, 'after-seal')).toEqual({ status: 'sealed', revision: header.revision });
      results.push({ seed, rooms: header.rooms, reason: header.seal!.reason, checks, buckets, singletonPassages });
    }
    const summary = { level, seeds: seeds.length, budget: createTopology(recipe(0, level)).header.roomBudget,
      minRooms: Math.min(...results.map(result => result.rooms)), maxRooms: Math.max(...results.map(result => result.rooms)),
      spatialLimits: results.filter(result => result.reason === 'spatial-limit'),
      maxProposalChecks: Math.max(...results.map(result => result.checks)), maxProposalBuckets: Math.max(...results.map(result => result.buckets)),
      minSingletonPassages: Math.min(...results.map(result => result.singletonPassages)), maxSingletonPassages: Math.max(...results.map(result => result.singletonPassages)) };
    console.info('TOPOLOGY_AUDIT', JSON.stringify(summary));
    expect(results.every(result => result.rooms === summary.budget)).toBe(true);
  }, 60000);
});

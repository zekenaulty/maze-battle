import { describe, expect, it } from 'vitest';
import { rpgPerceptionRegion } from './perception';
import { perceptionArchive, sight } from './perception.test-support';
import type { RpgPerceptionScope } from '../../domain/agentic/knowledge/perceptionTypes';
import { cellMemoryKey } from './keys';

const scope: RpgPerceptionScope = { floor: 1, row: 0, column: 0, rows: 1, columns: 5 };

describe('receipt-scoped perception regions', () => {
  it('separates current sight, permanent memory and unknown without consulting world geometry', async () => {
    const archive = await perceptionArchive([sight([0, 1, 2], 1), sight([0], 2)]), memory = archive.open();
    for (const key of ['game', 'maze', 'layout', 'chests', 'seed']) Object.defineProperty(memory.query, key,
      { get() { throw new Error(`Hidden read: ${key}`); } });
    const before = structuredClone([...archive.nodes]), frame = await rpgPerceptionRegion(memory.query, scope);
    expect(frame.cells.map(cell => [cell.fact.address.column, cell.state, cell.fact.source.id])).toEqual([
      [0, 'visible', 'sight-2'], [1, 'remembered', 'sight-1'], [2, 'remembered', 'sight-1'],
    ]);
    expect(frame.cells[2].fact.chests[0]).toMatchObject({ id: 'chest', opened: false });
    expect(frame.cells[0]).toMatchObject({ observation: sight([0], 2).cells[0] });
    expect(frame.cells[1]).not.toHaveProperty('observation');
    expect(frame.scope).toEqual(scope);
    expect(memory.get.mock.calls.flat()).toEqual(Array.from({ length: 5 }, (_, column) => cellMemoryKey({ floor: 1, row: 0, column })));
    expect(memory.budget.stats().writes).toBe(0);
    expect([...archive.nodes]).toEqual(before);
    expect(Object.isFrozen(frame.cells[2].fact.chests[0])).toBe(true);
  });

  it('reconciles only a new observation and preserves both old snapshot and old source', async () => {
    const observed = sight([2], 3);
    const changed = { ...observed, cells: observed.cells.map(cell => ({ ...cell, chests: [], blocked: ['north' as const, 'south' as const, 'east' as const] })) };
    const archive = await perceptionArchive([sight([0, 1, 2], 1), sight([0], 2), changed]);
    const before = await rpgPerceptionRegion(archive.open(1).query, scope);
    const after = await rpgPerceptionRegion(archive.open().query, scope);
    expect(before.cells[2].fact.chests).toHaveLength(1);
    expect(after.cells[2]).toMatchObject({ state: 'visible', fact: { chests: [], edges: { east: { state: 'blocked' } } } });
    expect(after.cells[0].state).toBe('remembered');
    expect(await rpgPerceptionRegion(archive.open(1).query, scope)).toEqual(before);
    expect(archive.sources.get('sight-1')!.observation.cells[2].chests[0].opened).toBe(false);
  });

  it('clips cells and sight to the requested floor and region, not actor distance', async () => {
    const memory = (await perceptionArchive([sight([0, 1, 2], 1), sight([0], 2, 2)])).open();
    const distant = await rpgPerceptionRegion(memory.query, { ...scope, column: 2, columns: 2 });
    expect(distant.actor.floor).toBe(2);
    expect(distant.cells.map(cell => [cell.fact.address.column, cell.state])).toEqual([[2, 'remembered']]);
    expect(await rpgPerceptionRegion(memory.query, { ...scope, floor: 3 })).toMatchObject({ cells: [] });
  });

  it.each([
    null, undefined, {}, { ...scope, rows: 0 }, { ...scope, columns: 65 }, { ...scope, rows: 64, columns: 17 },
    { ...scope, floor: 0 }, { ...scope, row: -1 }, { ...scope, column: 1.5 }, { ...scope, rows: NaN },
    { ...scope, column: Infinity }, { ...scope, column: Number.MAX_SAFE_INTEGER - 2, columns: 3 },
    { ...scope, row: Number.MAX_SAFE_INTEGER - 1, rows: 2 },
  ])('refuses invalid or oversized scopes before point reads: %j', async input => {
    const memory = (await perceptionArchive([sight([0], 1)])).open();
    await expect(rpgPerceptionRegion(memory.query, input as RpgPerceptionScope)).rejects.toThrow('Invalid or unavailable RPG memory');
    expect(memory.get).not.toHaveBeenCalled();
  });

  it('performs only the requested address work at maximum safe coordinates', async () => {
    const memory = (await perceptionArchive([sight([0], 1)])).open();
    const high = { ...scope, row: Number.MAX_SAFE_INTEGER - 2, column: Number.MAX_SAFE_INTEGER - 2, rows: 2, columns: 2 };
    expect(await rpgPerceptionRegion(memory.query, high)).toMatchObject({ cells: [], scope: high });
    expect(memory.get).toHaveBeenCalledTimes(4);
  });

  it('has fixed bounded reads for a maximal unknown region, independent of coordinate distance', async () => {
    const archive = await perceptionArchive([sight([0], 1)]);
    const costs: number[] = [];
    for (const origin of [100, 1_000_000]) {
      const memory = archive.open(), frame = await rpgPerceptionRegion(memory.query,
        { ...scope, row: origin, column: origin, rows: 32, columns: 32 });
      expect(frame.cells).toEqual([]);
      expect(memory.get).toHaveBeenCalledTimes(1024);
      expect(memory.budget.stats().writes).toBe(0);
      expect(memory.budget.stats().reads).toBeLessThanOrEqual(8192);
      costs.push(memory.budget.stats().reads);
    }
    expect(costs[0]).toBe(costs[1]);
  });

  it('retrieves old facts beyond the resident 2048-cell cap without replaying the history', async () => {
    const receipts = Array.from({ length: 130 }, (_, i) => sight(Array.from({ length: 17 }, (_, j) => i * 32 + j), i + 1));
    const memory = (await perceptionArchive(receipts)).open();
    const frame = await rpgPerceptionRegion(memory.query, scope);
    expect(frame.cells).toHaveLength(5);
    expect(frame.cells.every(cell => cell.state === 'remembered' && cell.fact.source.id === 'sight-1')).toBe(true);
    expect(memory.get).toHaveBeenCalledTimes(5);
    expect(memory.reads.length).toBeLessThan(20);
    expect(memory.budget.stats().reads).toBeLessThan(100);
    expect(memory.budget.stats().writes).toBe(0);
  });

  it('copies scope before awaits and freezes output without freezing caller input', async () => {
    const memory = (await perceptionArchive([sight([0, 1, 2], 1)])).open(), input = { ...scope };
    const pending = rpgPerceptionRegion(memory.query, input);
    input.column = 500; input.rows = 64;
    const result = await pending;
    expect(result.scope).toEqual(scope);
    expect(Object.isFrozen(result.scope)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('propagates budget exhaustion and cancellation; no partial success or discovery fallback', async () => {
    const archive = await perceptionArchive([sight([0, 1, 2], 1)]), controller = new AbortController();
    await expect(rpgPerceptionRegion(archive.open(0, { maxReads: 1 }).query, scope)).rejects.toThrow('read budget exhausted');
    controller.abort();
    await expect(rpgPerceptionRegion(archive.open(0, { signal: controller.signal }).query, scope)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not silently render fog for missing current facts or accept forged remembered contents', async () => {
    const archive = await perceptionArchive([sight([0, 1, 2], 1)]), missing = archive.open();
    missing.get.mockResolvedValueOnce(undefined);
    await expect(rpgPerceptionRegion(missing.query, scope)).rejects.toThrow('Invalid or unavailable RPG memory');
    const corrupt = archive.open(), value = await corrupt.query.tree.get(cellMemoryKey({ floor: 1, row: 0, column: 0 }));
    corrupt.get.mockResolvedValueOnce({ ...(value as object), fact: { ...(value as { fact: object }).fact, chests: [] , roomIds: ['unearned'] } });
    await expect(rpgPerceptionRegion(corrupt.query, scope)).rejects.toThrow('Invalid or unavailable RPG memory');
  });
});

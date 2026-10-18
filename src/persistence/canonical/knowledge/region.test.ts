import { describe, expect, it } from 'vitest';
import { loadObservation } from './evidence';
import { blockKey, localKey } from './keys';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { readKnowledgeRegion, validateRegionScope } from './region';
import { indexObservedWorldCells, loadWorldIndexBlock, worldBlockAddress, worldBlockKey } from './worldIndex';
import type { RememberedCell, MemoryBlock, ObservedCell } from './types';

const scope = { floor: 1, row: -8, column: -4, rows: 8, columns: 8 };
describe('canonical earned world regions', () => {
  it('indexes signed world positions separately from local room addresses and floors', async () => {
    const f = knowledgeFixture(), a = earnedCell(), b = earnedCell(-4, 1, 'other');
    await f.observe([a, b]);
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), scope);
    expect(region.cells.map(c => c.cell.at)).toEqual([a.at, b.at]);
    expect(region.actor).toEqual(a.world);
    expect(worldBlockAddress(1, a.world)).toEqual({ floor: 1, row: -2, column: -1 });
    expect((await readKnowledgeRegion(f.pages, f.checkpoint(), { ...scope, floor: 2 })).cells).toEqual([]);
    expect(f.reads.every(key => key.startsWith('perception/'))).toBe(true);
  });

  it('leaves COW spatial and memory records untouched on unchanged sightings and preserves old receipts', async () => {
    const f = knowledgeFixture(), cell = earnedCell();
    await f.observe([cell]); const first = f.checkpoint(), key = worldBlockKey(1, cell.world), mk = blockKey(cell.at);
    const index = structuredClone(f.records.get(key)), memory = structuredClone(f.records.get(mk));
    const reference = { sequence: first.knowledge!.sequence, id: first.knowledge!.id };
    const evidence = await loadObservation(f.pages, reference);
    f.writes.length = 0; await f.observe([cell]);
    expect(f.records.get(key)).toEqual(index); expect(f.records.get(mk)).toEqual(memory);
    expect(f.writes).not.toContain(key); expect(f.writes).not.toContain(mk);
    expect(await loadObservation(f.pages, reference)).toEqual(evidence);
    expect((await readKnowledgeRegion(f.pages, f.checkpoint(), scope)).cells[0]).toMatchObject({ state: 'visible', cell: { source: { sequence: 1 } } });
  });

  it('changes only the earned block and keeps historical snapshot facts exact', async () => {
    const f = knowledgeFixture(), a = earnedCell(), b = earnedCell(-4, 1, 'other');
    await f.observe([a, b]); const snapshot = f.snapshot(), before = await readKnowledgeRegion(snapshot.pages, snapshot.checkpoint(), scope);
    const untouched = structuredClone(f.records.get(worldBlockKey(1, b.world)));
    const opened = { ...a, chests: [{ id: 'chest', opened: true }] }; await f.observe([opened]);
    expect(f.records.get(worldBlockKey(1, b.world))).toEqual(untouched);
    expect((await readKnowledgeRegion(f.pages, f.checkpoint(), scope)).cells[0].cell.chests[0].opened).toBe(true);
    expect(await readKnowledgeRegion(snapshot.pages, snapshot.checkpoint(), scope)).toEqual(before);
    await expect(readKnowledgeRegion(f.pages, snapshot.checkpoint(), scope)).rejects.toThrow('knowledge namespace');
  });

  it('does not load offscreen memory or any room/floor list, even in a maximum-area empty window', async () => {
    const f = knowledgeFixture(); await f.observe([earnedCell()]); f.reads.length = 0;
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), { floor: 1, row: 101, column: 101, rows: 64, columns: 16 });
    expect(region.cells).toEqual([]);
    expect(f.reads.filter(key => key.startsWith('perception/world/'))).toHaveLength(170);
    expect(f.reads.some(key => key.includes('/cell/') || key.includes('/room/'))).toBe(false);
  });

  it('keeps original edge receipts when later observation coverage omits them', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); await f.observe([cell]);
    await f.observe([{ ...cell, edges: {}, chests: [{ id: 'chest', opened: true }] }]);
    await f.observe([earnedCell(100, 100, 'elsewhere')]);
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), scope), fact = region.cells[0].cell;
    expect(region.cells[0].state).toBe('remembered'); expect(fact.source.sequence).toBe(2);
    expect(fact.edges.north?.source.sequence).toBe(1);
  });

  it('resolves all 1024 earned coordinates within a maximum-area window', async () => {
    const f = knowledgeFixture();
    for (let r = 0; r < 32; r++) await f.observe(Array.from({ length: 32 }, (_, c) => earnedCell(r - 16, c - 16, 'large-room', r, c)));
    f.reads.length = 0;
    const region = await readKnowledgeRegion(f.pages, f.checkpoint(), { floor: 1, row: -16, column: -16, rows: 32, columns: 32 });
    expect(region.cells).toHaveLength(1024);
    expect(region.cells.filter(c => c.state === 'visible')).toHaveLength(32);
    expect(f.reads.filter(key => key.includes('/world/'))).toHaveLength(128);
    expect(f.reads.filter(key => key.includes('/cell/'))).toHaveLength(64);
    expect(f.reads.filter(key => key.includes('/observation/')).length).toBeLessThanOrEqual(102);
  });

  it('rejects a forged mapping, missing visible entry and source mutation', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); await f.observe([cell]);
    const key = worldBlockKey(1, cell.world), saved = structuredClone(f.records.get(key)!);
    const b = f.records.get(key)!.value as unknown as { cells: Record<string, { at: ObservedCell['at'] }> };
    b.cells['-5:-2'].at.cell.spaceId = 'forged';
    await expect(readKnowledgeRegion(f.pages, f.checkpoint(), scope)).rejects.toThrow('spatial index');
    f.records.delete(key);
    await expect(readKnowledgeRegion(f.pages, f.checkpoint(), scope)).rejects.toThrow('missing spatial index');
    f.records.set(key, saved);
    const memory = f.records.get(blockKey(cell.at))!.value as unknown as MemoryBlock;
    memory.cells[localKey(cell.at)].chests[0].opened = true;
    await expect(readKnowledgeRegion(f.pages, f.checkpoint(), scope)).rejects.toThrow('source evidence');
  });

  it('rejects conflicting earned coordinates instead of replacing the earlier address', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); await f.observe([cell]);
    const other = earnedCell(-5, -2, 'other');
    const old = (f.records.get(blockKey(cell.at))!.value as unknown as MemoryBlock).cells['0:0'];
    await f.pages.set('knowledge', blockKey(other.at), { schema: 1, level: 1, spaceId: 'other', row: 0, column: 0,
      cells: { '0:0': { ...old, at: other.at } as RememberedCell } } as never);
    await expect(indexObservedWorldCells(f.pages, [other])).rejects.toThrow('conflicting earned');
  });

  it('validates every spatial block member and bounds before I/O', async () => {
    const f = knowledgeFixture(), cell = earnedCell(); await f.observe([cell]);
    const block = f.records.get(worldBlockKey(1, cell.world))!.value as unknown as { cells: Record<string, unknown> };
    block.cells.extra = block.cells['-5:-2'];
    await expect(loadWorldIndexBlock(f.pages, 1, cell.world)).rejects.toThrow('foreign world index cell');
    f.reads.length = 0;
    for (const invalid of [{ rows: 0 }, { columns: 65 }, { rows: 33, columns: 32 }, { row: 0.1 }, { row: Number.MAX_SAFE_INTEGER }])
      await expect(readKnowledgeRegion(f.pages, f.checkpoint(), { ...scope, ...invalid })).rejects.toThrow(RangeError);
    expect(f.reads).toEqual([]);
    expect(() => validateRegionScope({ ...scope, row: Number.MIN_SAFE_INTEGER })).not.toThrow();
  });
});

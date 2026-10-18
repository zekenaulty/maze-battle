// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CanonicalRecord } from '../types';
import { compareExplorationObservation, MAX_EXPLORATION_READS, MAX_EXPLORATION_READ_BYTES } from './explorationPolicy';
import { comparison, floorCell } from './explorationPolicy.test-support';
import { explorationPages } from './explorationPolicy.read';
import { blockKey, localKey, observationKey } from './keys';
import { knowledgeFixture } from './region.test-support';
import type { MemoryBlock, ObservationHeader, ObservedCell } from './types';
import { worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';

describe('exploration evidence guards', () => {
  it.each(['no-sight', 'town', 'wrong-scope', 'stale-actor', 'wrong-witness', 'post-write-pages'] as const)
  ('refuses %s instead of returning quiet', async kind => {
    const actor = floorCell(), f = await comparison([actor], [actor]), checkpoint = f.before.checkpoint();
    if (kind === 'no-sight') checkpoint.knowledge = null;
    if (kind === 'town') checkpoint.mode = 'town';
    if (kind === 'stale-actor') checkpoint.position = floorCell(1).at;
    if (kind === 'wrong-witness') checkpoint.knowledge!.witness = 'foreign';
    if (kind === 'post-write-pages') await f.before.observe([actor]);
    await expect(compareExplorationObservation(f.before.pages, checkpoint, [actor], kind === 'wrong-scope' ? 'other' : 'room')).rejects.toThrow();
  });
  it.each(['empty', 'overflow', 'duplicate-address', 'duplicate-world', 'foreign-floor', 'extra-field', 'nonreciprocal', 'uncovered'] as const)
  ('rejects malformed engine input: %s', async kind => {
    const actor = floorCell(), next = floorCell(1), f = await comparison([actor], [actor]);
    let cells = [structuredClone(actor)];
    if (kind === 'empty') cells = [];
    if (kind === 'overflow') cells = Array.from({ length: 114 }, (_, i) => floorCell(i));
    if (kind === 'duplicate-address') cells.push(structuredClone(actor));
    if (kind === 'duplicate-world') cells.push({ ...next, world: actor.world });
    if (kind === 'foreign-floor') cells[0].at.level = 2;
    if (kind === 'extra-field') Object.assign(cells[0], { hidden: true });
    if (kind === 'nonreciprocal') cells = [{ ...actor, edges: { east: next.at } }, next];
    if (kind === 'uncovered') cells[0].edges.east = next.at;
    await expect(compareExplorationObservation(f.before.pages, f.before.checkpoint(), cells, 'room')).rejects.toThrow();
    expect(f.before.reads).toEqual([]); expect(f.before.writes).toEqual([]);
  });
  it.each(['memory-fact', 'memory-source', 'missing-memory', 'missing-spatial-member', 'missing-integrity', 'missing-source', 'future-source'] as const)
  ('rejects %s in remembered cells beyond pre-move sight', async kind => {
    const actor = floorCell(), old = { ...floorCell(8), chests: [{ id: 'remembered', opened: false }] };
    const f = await comparison([actor], [actor, old], [actor, old]), records = f.before.records;
    const memory = (records.get(blockKey(old.at))!.value as unknown as MemoryBlock).cells[localKey(old.at)];
    const spatial = records.get(worldBlockKey(1, old.world))!.value as unknown as WorldIndexBlock;
    if (kind === 'memory-fact') memory.chests[0].opened = true;
    if (kind === 'memory-source') memory.source.index = 0;
    if (kind === 'missing-memory') records.delete(blockKey(old.at));
    if (kind === 'missing-spatial-member') delete spatial.cells[worldCellKey(old.world)];
    if (kind === 'missing-integrity') records.delete(`${worldBlockKey(1, old.world)}/integrity`);
    if (kind === 'missing-source') records.delete(observationKey(1));
    if (kind === 'future-source') memory.source.sequence = 3;
    await expect(f.read()).rejects.toThrow(); expect(f.before.writes).toEqual([]);
  });
  it('validates later evidence before returning an early new POI or space entry', async () => {
    const actor = floorCell(), old = floorCell(8), poi = { ...floorCell(1), chests: [{ id: 'new', opened: false }] };
    for (const entered of [false, true]) {
      const first = entered ? floorCell(2, 'other') : actor;
      const f = await comparison([actor], [first, poi, old], [actor, old]);
      const memory = f.before.records.get(blockKey(old.at))!.value as unknown as MemoryBlock;
      memory.cells[localKey(old.at)].stairs = ['down'];
      await expect(f.read()).rejects.toThrow('source evidence');
    }
  });
  it('rejects physical coordinate reassignment instead of treating it as ordinary new floor', async () => {
    const actor = floorCell(), old = floorCell(1), replacement = floorCell(1, 'replacement');
    const f = await comparison([actor, old], [actor, replacement]);
    await expect(f.read()).rejects.toThrow('memory is missing');
    f.cells[1] = { ...old, world: { row: 0, column: 9 } };
    await expect(f.read()).rejects.toThrow('spatial evidence');
  });
  it('rejects a replaced current chunk or actor/header disagreement', async () => {
    for (const kind of ['chunk', 'actor']) {
      const actor = floorCell(), f = await comparison([actor], [actor]);
      if (kind === 'chunk') f.before.records.get(`${observationKey(1)}/0`)!.id = 'foreign';
      else (f.before.records.get(observationKey(1))!.value as unknown as ObservationHeader).actor = floorCell(1).at;
      await expect(f.read()).rejects.toThrow();
    }
  });
  it('owns checkpoint and prospective cells before the first read can suspend', async () => {
    const actor = floorCell(), poi = { ...actor, chests: [{ id: 'new', opened: false }] }, f = await comparison([actor], [poi]);
    const checkpoint = f.before.checkpoint(), original = f.before.pages.witness.bind(f.before.pages);
    f.before.pages.witness = async (...args) => {
      checkpoint.position.cell.spaceId = 'mutated'; f.cells[0].chests = [];
      return original(...args);
    };
    expect(await compareExplorationObservation(f.before.pages, checkpoint, f.cells, 'room'))
      .toMatchObject({ reason: 'unopened-chest', chestId: 'new', at: actor.at, index: 0 });
  });
});

describe('exploration logical work bounds', () => {
  function sight(): ObservedCell[] {
    const result = [floorCell()];
    for (let row = -7; row <= 7; row++) for (let column = -7; column <= 7; column++) {
      if (Math.abs(row) + Math.abs(column) > 7 || !row && !column) continue;
      result.push({ ...floorCell(), at: { level: 1, cell: { spaceId: 'room', row: row + 8, column: column + 8 } }, world: { row, column } });
    }
    return result;
  }
  it('handles 113 cells with bounded reads, no writes/scans/world reads and no growth from unrelated history', async () => {
    const cells = sight(), f = await comparison(cells, cells), records = structuredClone(f.before.records);
    expect(await f.read()).toBeNull(); const reads = [...f.before.reads];
    expect(reads.length).toBeLessThanOrEqual(MAX_EXPLORATION_READS);
    expect(new Set(reads).size).toBe(reads.length); expect(reads.every(key => key.startsWith('perception/'))).toBe(true);
    expect(f.before.records).toEqual(records); expect(f.before.writes).toEqual([]);
    for (let i = 0; i < 2000; i++) f.before.records.set(`unrelated/${i}`, { id: `unrelated-${i}`, value: null } as CanonicalRecord);
    f.before.reads.length = 0; expect(await f.read()).toBeNull(); expect(f.before.reads).toEqual(reads);
  });
  it('throws rather than clearing a comparison whose exact retained sources exhaust the read budget', async () => {
    const cells = sight(), f = knowledgeFixture(); await f.observe(cells);
    for (let i = 1; i <= 36; i++) { cells[i].chests = [{ id: `chest-${i}`, opened: false }]; await f.observe(cells); }
    f.reads.length = f.writes.length = 0;
    await expect(compareExplorationObservation(f.pages, f.checkpoint(), cells, 'room')).rejects.toThrow('read budget exhausted');
    expect(f.reads.length).toBeLessThanOrEqual(MAX_EXPLORATION_READS); expect(f.writes).toEqual([]);
  });
  it('enforces the byte cap and refuses even attempted world reads or scans', async () => {
    const f = knowledgeFixture(), pages = explorationPages(f.pages);
    f.records.set('oversized', { value: 'x'.repeat(MAX_EXPLORATION_READ_BYTES) } as CanonicalRecord);
    await expect(pages.get('knowledge', 'oversized')).rejects.toThrow();
    await expect(pages.get('world', 'hidden')).rejects.toThrow('knowledge only');
    await expect(pages.scan('knowledge', 'perception/')).rejects.toThrow('cannot scan');
    expect(f.reads).toEqual(['oversized']); expect(f.writes).toEqual([]);
  });
});

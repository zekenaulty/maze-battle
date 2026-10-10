import { describe, expect, it } from 'vitest';
import { deleteExpedition, loadExpedition, saveExpedition, validateExpeditionRecord } from './expeditionRepository';
import { storageFixture, testSpace } from '../domain/expedition/storage.testSupport';
import { addressKey } from '../domain/expedition/address';
import { opposite } from '../domain/maze/movement';
import type { Direction } from '../domain/types';

function singleSpace(rows = 1, columns = 1) {
  const record = storageFixture();
  record.plan.spaces = [testSpace('room-a', rows, columns)];
  record.checkpoint.openedChestIds = [];
  record.checkpoint.knowledge = { cells: {}, openings: {}, chests: {} };
  return record;
}

describe('bounded expedition record contracts', () => {
  it('accepts exactly 24 spaces and a 512-cell space with 512 chests', () => {
    const record = singleSpace(1, 512);
    const space = record.plan.spaces[0];
    space.kind = 'passage';
    space.chests = Array.from({ length: 512 }, (_, column) => ({ id: `loot-${column}`, cell: { row: 0, column } }));
    for (let i = 1; i < 24; i++) record.plan.spaces.push(testSpace(`extra-${i}`, 1, 1));
    expect(() => validateExpeditionRecord(record)).not.toThrow();
  });

  it.each([0, 0xffffffff])('accepts uint32 boundary seed %s', seed => {
    const record = storageFixture();
    record.plan.recipe.seed = record.plan.spaces[0].seed = seed;
    expect(() => validateExpeditionRecord(record)).not.toThrow();
  });

  it('accepts maximum-length IDs and a 512-character JSON scope identity', () => {
    const record = singleSpace();
    record.plan.recipe.worldId = record.checkpoint.worldId = 'w'.repeat(128);
    record.plan.recipe.floorId = record.checkpoint.floorId = 'f'.repeat(128);
    record.plan.scopeId = record.checkpoint.scopeId = JSON.stringify('s'.repeat(510));
    record.plan.spaces[0].id = 'a'.repeat(128);
    record.plan.start.spaceId = record.checkpoint.position.spaceId = record.checkpoint.home.spaceId = record.plan.spaces[0].id;
    record.plan.spaces[0].chests = [{ id: 'c'.repeat(128), cell: { row: 0, column: 0 } }];
    expect(() => validateExpeditionRecord(record)).not.toThrow();
    expect(record.plan.scopeId).toHaveLength(512);
  });

  it('accepts all four outward boundaries, exactly the perimeter port limit', () => {
    const record = singleSpace();
    const center = record.plan.spaces[0];
    for (const direction of ['north', 'east', 'south', 'west'] as Direction[]) {
      const neighbor = testSpace(direction, 1, 1);
      center.openings.push({ id: direction.repeat(20), cell: { row: 0, column: 0 }, direction,
        destination: { spaceId: neighbor.id, row: 0, column: 0 } });
      neighbor.openings.push({ id: `back-${direction}`, cell: { row: 0, column: 0 }, direction: opposite(direction),
        destination: { spaceId: center.id, row: 0, column: 0 } });
      record.plan.spaces.push(neighbor);
    }
    center.openings[0].id = 'o'.repeat(128);
    expect(() => validateExpeditionRecord(record)).not.toThrow();
  });

  it('accepts correctly keyed knowledge observed at or before the checkpoint revision', () => {
    const record = storageFixture();
    record.checkpoint.revision = 2;
    record.checkpoint.knowledge.cells[addressKey(record.plan.start)].observedAt = 2;
    record.checkpoint.knowledge.openings['a-b'].observedAt = 1;
    record.checkpoint.knowledge.chests['chest-a'].observedAt = 2;
    expect(() => validateExpeditionRecord(record)).not.toThrow();
  });

  const invalid: [string, (record: ReturnType<typeof storageFixture>) => void, string][] = [
    ['25 spaces', r => { while (r.plan.spaces.length < 25) r.plan.spaces.push(testSpace(`extra-${r.plan.spaces.length}`)); }, 'spaces'],
    ['area 513', r => { r.plan.spaces[0].rows = 1; r.plan.spaces[0].columns = 513; }, 'space dimensions/seed'],
    ['world ID length', r => { r.plan.recipe.worldId = r.checkpoint.worldId = 'w'.repeat(129); }, 'plan identity'],
    ['floor ID length', r => { r.plan.recipe.floorId = r.checkpoint.floorId = 'f'.repeat(129); }, 'plan identity'],
    ['scope ID length', r => { r.plan.scopeId = r.checkpoint.scopeId = JSON.stringify('s'.repeat(511)); }, 'plan identity'],
    ['space ID length', r => { r.plan.spaces[0].id = 'a'.repeat(129); }, 'space identity'],
    ['opening ID length', r => { r.plan.spaces[0].openings[0].id = 'o'.repeat(129); }, 'opening identity'],
    ['chest ID length', r => { r.plan.spaces[0].chests[0].id = 'c'.repeat(129); }, 'chest identity'],
    ['origin overflow', r => { r.plan.spaces[0].origin.row = Number.MAX_SAFE_INTEGER; }, 'space bounds'],
    ['opening count', r => { r.plan.spaces[0].openings = new Array(9); }, 'space contents'],
    ['chest count', r => { r.plan.spaces[0].chests = new Array(5); }, 'space contents'],
    ['global opening IDs', r => { r.plan.spaces[1].openings[0].id = 'a-b'; }, 'opening identity'],
    ['self opening', r => { r.plan.spaces[0].openings[0].destination.spaceId = 'room-a'; }, 'opening boundary'],
    ['duplicate chest cell', r => { r.plan.spaces[0].chests.push({ id: 'other', cell: { row: 1, column: 1 } }); }, 'duplicate chest cell'],
    ['chest on opening', r => { r.plan.spaces[0].chests[0].cell.row = 0; }, 'chest overlaps opening'],
    ['chest and opening ID collision', r => { r.plan.spaces[0].chests[0].id = 'a-b'; }, 'chest overlaps opening'],
    ['cell knowledge count', r => { r.checkpoint.knowledge.cells = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, { ...r.plan.start, links: [], observedAt: 0 }])); }, 'knowledge count'],
    ['opening knowledge count', r => { const value = r.checkpoint.knowledge.openings['a-b']; r.checkpoint.knowledge.openings = { a: value, b: value, c: value }; }, 'knowledge count'],
    ['chest knowledge count', r => { r.checkpoint.knowledge.chests.other = r.checkpoint.knowledge.chests['chest-a']; }, 'knowledge count'],
  ];
  it.each(invalid)('rejects %s before inspecting unbounded contents', (_name, change, error) => {
    const record = storageFixture();
    change(record);
    const before = structuredClone(record);
    expect(() => validateExpeditionRecord(record)).toThrow(`Invalid expedition: ${error}`);
    expect(record).toEqual(before);
  });

  it.each([-1, 0.5, 0x100000000, Infinity, NaN])('rejects non-uint32 seed %s at both levels', seed => {
    const record = storageFixture();
    record.plan.recipe.seed = seed;
    expect(() => validateExpeditionRecord(record)).toThrow('recipe parameters');
    record.plan.recipe.seed = 42;
    record.plan.spaces[0].seed = seed;
    expect(() => validateExpeditionRecord(record)).toThrow('space dimensions/seed');
  });

  it.each(['north', 'east', 'south', 'west'] as Direction[])('rejects an interior opening facing %s', direction => {
    const record = storageFixture();
    const space = record.plan.spaces[0];
    space.rows = space.columns = 3;
    space.openings[0].cell = { row: 1, column: 1 };
    space.openings[0].direction = direction;
    expect(() => validateExpeditionRecord(record)).toThrow('opening boundary');
  });

  it.each(['cells', 'openings', 'chests'] as const)('requires exact keys and nonfuture observation revisions for %s', kind => {
    const record = storageFixture();
    const [key, entry] = Object.entries(record.checkpoint.knowledge[kind])[0];
    Object.assign(record.checkpoint.knowledge, { [kind]: { wrong: entry } });
    expect(() => validateExpeditionRecord(record)).toThrow('knowledge key');
    Object.assign(record.checkpoint.knowledge, { [kind]: { [key]: { ...entry, observedAt: 1 } } });
    expect(() => validateExpeditionRecord(record)).toThrow('knowledge address/time');
  });

  it('rejects oversized slot IDs before touching IndexedDB', async () => {
    const { plan, checkpoint } = storageFixture();
    const slot = 's'.repeat(129);
    await expect(loadExpedition(slot)).rejects.toThrow('slot id');
    await expect(saveExpedition(slot, plan, checkpoint, null)).rejects.toThrow('slot id');
    await expect(deleteExpedition(slot)).rejects.toThrow('slot id');
  });
});

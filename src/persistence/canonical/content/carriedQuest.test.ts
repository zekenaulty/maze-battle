// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ownedQuestItemCount } from '../../../domain/quests/questItems';
import { itemIndexes } from '../roster/records';
import { json } from '../world/records';
import { readCarriedQuest } from './carriedQuest';
import { carriedFixture } from './carriedQuest.test-support';

describe('selected carried quest evidence', () => {
  it.each([
    ['pack', 'complete'], ['stash', 'complete'], ['pack', 'claimed'], ['stash', 'claimed'],
  ] as const)('distinguishes %s ownership for an ordinary %s quest', async (owner, status) => {
    const f = await carriedFixture(owner, status), before = structuredClone([...f.records]);
    expect(ownedQuestItemCount(f.state, f.quest.quest)).toBe(1);
    const result = await readCarriedQuest(f.pages, f.ref);
    expect(result).toEqual({ generation: f.record.generation, gameId: f.record.gameId, quest: f.ref, floor: 1, status,
      containers: { pack: { key: f.packRecord.key, id: f.packRecord.id }, stash: { key: f.stashRecord.key, id: f.stashRecord.id } },
      items: [{ source: { key: f.key, id: f.itemRecord!.id }, owner, count: 1 }],
      packCount: owner === 'pack' ? 1 : 0, stashCount: owner === 'stash' ? 1 : 0 });
    expect(f.get.mock.calls).toEqual([f.record.key, f.contractRecord.key, 'roster/pack', 'roster/stash', f.key]
      .map(key => ['world', key]));
    expect(f.scan.mock.calls).toEqual([['world', f.prefix, undefined, 1], ['world', f.itemRecord!.indexes[0], undefined, 1]]);
    expect([...f.records]).toEqual(before);
    f.itemRecord!.id = 'later-item-record'; f.record.id = 'later-quest-record';
    expect(result.quest.id).toBe(f.ref.id); expect(result.items[0].source.id).not.toBe(f.itemRecord!.id);
  });

  it.each(['active', 'complete', 'claimed'] as const)('reports zero from actual absence, not %s status or award history', async status => {
    const f = await carriedFixture(null, status);
    expect(f.quest.award !== null).toBe(status !== 'active');
    expect(await readCarriedQuest(f.pages, f.ref)).toMatchObject({ status, packCount: 0, stashCount: 0, items: [] });
    expect(f.get).toHaveBeenCalledTimes(5); expect(f.scan).toHaveBeenCalledTimes(1);
  });

  it('uses ordinary token/spec matching, not display name or an explicit quantity field', async () => {
    const f = await carriedFixture();
    f.stored.item.displayName = 'Renamed collectible'; delete f.stored.item.quantity;
    expect(ownedQuestItemCount({ ...f.state, inventory: { ...f.state.inventory, items: [f.stored.item] } }, f.quest.quest)).toBe(1);
    expect(await readCarriedQuest(f.pages, f.ref)).toMatchObject({ packCount: 1, stashCount: 0 });
  });

  it('owns the selected reference before yielding and ignores unrelated inventory and hidden sources', async () => {
    const f = await carriedFixture(), ref = { ...f.ref };
    for (let n = 0; n < 100; n++) f.records.set(`roster/item/unrelated-${n}`, {
      ...f.itemRecord!, key: `roster/item/unrelated-${n}`, indexes: [`roster/quest-items/other/unrelated-${n}`], value: { corrupt: true },
    });
    f.records.set('dungeon/1/chest/source', { ...f.itemRecord!, key: 'dungeon/1/chest/source', indexes: [], value: { corrupt: true } });
    const pending = readCarriedQuest(f.pages, ref); ref.id = 'changed-after-call';
    expect(await pending).toMatchObject({ quest: f.ref, packCount: 1 });
    expect(f.get).toHaveBeenCalledTimes(5); expect(f.scan).toHaveBeenCalledTimes(2);
  });

  it.each(['id', 'unaccepted', 'non-fetch', 'no-spec', 'multi-item'] as const)('rejects unsupported selected quest: %s', async defect => {
    const f = await carriedFixture(null, 'active'), q = f.quest.quest, c = f.contract.contract;
    if (defect === 'id') f.ref.id = 'other-record';
    if (defect === 'unaccepted') f.contract.accepted = false;
    if (defect === 'non-fetch') { q.task.objective = c.task.objective = c.objective = 'scout'; delete q.task.item; delete c.task.item; }
    if (defect === 'no-spec') { delete q.task.item; delete c.task.item; }
    if (defect === 'multi-item') q.task.required = c.task.required = 2;
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow();
    expect(f.scan).not.toHaveBeenCalled();
  });

  it('does not turn a matching but unawarded item into custody proof', async () => {
    const f = await carriedFixture('pack', 'active');
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow('award provenance');
  });
});

type Fixture = Awaited<ReturnType<typeof carriedFixture>>;
const damage: [string, (f: Fixture) => void][] = [
  ['record key', f => { f.itemRecord!.key = 'roster/item/other'; }],
  ['record id', f => { f.itemRecord!.id = 'invalid/id'; }],
  ['record game', f => { f.itemRecord!.gameId = 'other-game'; }],
  ['record generation', f => { f.itemRecord!.generation = 'other-generation'; }],
  ['record area', f => { f.itemRecord!.area = 'execution'; }],
  ['record revision', f => { f.itemRecord!.revision = -1; }],
  ['missing ownership index', f => { f.itemRecord!.indexes.shift(); }],
  ['missing quest index', f => { f.itemRecord!.indexes.pop(); }],
  ['extra index', f => { f.itemRecord!.indexes.push('extra'); }],
  ['foreign quest', f => { f.stored.item.questId = 'other-quest'; }],
  ['wrong stable identity', f => { f.stored.item.id = 'other-item'; }],
  ['wrong item spec', f => { f.stored.item.baseId = 'other-base'; }],
  ['wrong item token', f => { f.stored.item.token = 'other-token'; }],
  ['wrong category', f => { f.stored.item.category = 'consumable'; }],
  ['stacked collectible', f => { f.stored.item.quantity = 2; }],
  ['empty collectible', f => { f.stored.item.quantity = 0; }],
  ['fractional quantity', f => { f.stored.item.quantity = 0.5; }],
  ['nonfinite quantity', f => { f.stored.item.quantity = Infinity; }],
  ['schema', f => { Object.assign(f.stored, { schema: 2 }); }],
  ['foreign field', f => { Object.assign(f.stored, { obsolete: true }); }],
  ['owner index mismatch', f => { f.stored.owner = { kind: 'stash' }; }],
  ['equipped quest', f => { f.stored.owner = { kind: 'equipped', actorId: 'actor', slot: 'weapon' }; }],
  ['container actor ownership', f => { Object.assign(f.stored.owner, { actorId: 'actor' }); }],
  ['order', f => { f.stored.order = 0; }],
  ['container count', f => { f.pack.count = 0; }],
  ['container next order', f => { f.pack.nextOrder = f.stored.order; }],
  ['container identity', f => { f.packRecord.key = 'roster/stash'; }],
  ['container indexes', f => { f.packRecord.indexes = ['extra']; }],
  ['container game', f => { f.stashRecord.gameId = 'other-game'; }],
  ['container shape', f => { Object.assign(f.stash, { count: -1 }); }],
];
describe('carried quest integrity and bounds', () => {
  it.each(damage)('rejects %s instead of returning an unqualified count', async (_label, mutate) => {
    const f = await carriedFixture(); mutate(f);
    f.scan.mockResolvedValue({ rows: [structuredClone(f.itemRecord!)] });
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow();
    expect(f.get.mock.calls.length).toBeLessThanOrEqual(5); expect(f.scan.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it.each(['pack', 'stash'] as const)('requires the initialized %s container even for zero stock', async group => {
    const f = await carriedFixture(null); f.records.delete(`roster/${group}`);
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow('missing carried quest container');
  });

  it.each(['omitted-index', 'dangling-index', 'superseded-id', 'changed-body'] as const)('refuses incomplete or mismatched %s evidence', async defect => {
    const f = await carriedFixture(), candidate = structuredClone(f.itemRecord!);
    if (defect === 'dangling-index') f.records.delete(f.key);
    if (defect === 'superseded-id') candidate.id = 'older-record';
    if (defect === 'changed-body') candidate.value = json({ ...f.stored, item: { ...f.stored.item, displayName: 'Older name' } });
    f.scan.mockResolvedValue({ rows: defect === 'omitted-index' ? [] : [candidate] });
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow();
  });

  it('fails on extra matching candidates instead of draining pages or crediting duplicate stock', async () => {
    const f = await carriedFixture(), extra = { ...f.stored, item: { ...f.stored.item, id: 'extra-item' }, order: 2 };
    f.records.set('roster/item/extra-item', { ...f.itemRecord!, key: 'roster/item/extra-item', id: 'extra-record',
      indexes: itemIndexes(extra), value: json(extra) });
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow('excessive carried quest candidates');
    expect(f.scan).toHaveBeenCalledTimes(1); expect(f.get).toHaveBeenCalledTimes(4);
  });

  it.each(['oversized', 'empty-continuation', 'continuation'] as const)('rejects %s scan output', async defect => {
    const f = await carriedFixture();
    f.scan.mockResolvedValue(defect === 'oversized' ? { rows: [f.itemRecord!, f.itemRecord!] }
      : { rows: defect === 'empty-continuation' ? [] : [f.itemRecord!], next: `${f.prefix}${f.stored.item.id}` });
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow('incomplete or excessive');
    expect(f.scan).toHaveBeenCalledTimes(1); expect(f.get).toHaveBeenCalledTimes(4);
  });

  it.each(['get', 'scan'] as const)('propagates %s budget exhaustion, never zero or partial success', async operation => {
    const f = await carriedFixture(), error = Error('canonical read/byte budget exhausted');
    f[operation].mockRejectedValueOnce(error);
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toBe(error);
  });

  it.each(['missing', 'other-record', 'continuation', 'budget'] as const)('requires the exact selected ownership index: %s', async defect => {
    const f = await carriedFixture(), candidate = structuredClone(f.itemRecord!);
    f.scan.mockImplementationOnce(f.scan.getMockImplementation()!);
    if (defect === 'budget') f.scan.mockRejectedValueOnce(Error('ownership read budget exhausted'));
    else {
      if (defect === 'other-record') candidate.id = 'different-record';
      f.scan.mockResolvedValueOnce({ rows: defect === 'missing' ? [] : [candidate],
        ...(defect === 'continuation' ? { next: candidate.indexes[0] } : {}) });
    }
    await expect(readCarriedQuest(f.pages, f.ref)).rejects.toThrow();
    expect(f.get).toHaveBeenCalledTimes(5); expect(f.scan).toHaveBeenCalledTimes(2);
    expect(f.scan.mock.calls[1]).toEqual(['world', f.itemRecord!.indexes[0], undefined, 1]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { QuestStatus } from '../../../domain/types';
import { json } from '../world/records';
import { listAcceptedQuests, readAcceptedQuest } from './acceptedQueries';
import { addQuest, now, pair, questMemory, restricted, seededQuest } from './acceptedQueries.test-support';
import { openStoredChest } from './openChest';
import { listFloorQuests } from './queries';
import { claimReward } from './questActions';
import { loadAcceptedQuest, loadChest, loadContract, loadRoomContent, questIndexes } from './records';

describe('accepted quest reader boundary', () => {
  it('matches a real seeded acceptance, collection and claim without hidden reads, even with an award', async () => {
    const m = await seededQuest(), id = m.quest.quest.id, c = m.contract.contract;
    expect(m.party.activityLog).toContain(`Accepted quest: ${c.title}.`);
    expect(m.records.size).toBeGreaterThan(20);
    let party = m.party;
    for (const status of ['active', 'complete', 'claimed'] as const) {
      const f = pair(m, id), r = restricted(m), before = structuredClone([...m.records]);
      const ordinary = await listFloorQuests(m.pages, 1, status);
      const authoritative = await loadAcceptedQuest(m.pages, await loadContract(m.pages, id));
      const result = await listAcceptedQuests(r.pages, 1, status);
      expect(result.rows.map(row => row.quest.quest)).toEqual(ordinary.quests);
      expect(result).toEqual({ rows: [{ record: f.record, quest: authoritative }] });
      expect(await readAcceptedQuest(r.pages, f.ref)).toEqual(result.rows[0]);
      expect(r.scan.mock.calls).toEqual([['world', `quests/floor/1/${status}/`, undefined, 4]]);
      expect(r.get.mock.calls).toEqual([...Array(2)].flatMap(() =>
        [['world', f.record.key], ['world', f.contractRecord.key]]));
      expect([...m.records]).toEqual(before);
      if (status === 'active') {
        const room = await loadRoomContent(m.pages, 1, c.targetRoomId);
        const stored = await loadChest(m.pages, 1, room.chestId!);
        const chest = await openStoredChest(m.pages, room.chestId!, { level: 1,
          cell: { spaceId: c.targetRoomId, ...stored.chest.position } }, { ...party, mode: 'manual' }, now, () => 0.5);
        party = chest.roster;
        expect(pair(m, id).quest.award).not.toBeNull();
      } else if (status === 'complete') party = await claimReward(m.pages, id, { ...party, mode: 'town' }, now);
    }
    const f = pair(m, id), r = restricted(m), expected = await listAcceptedQuests(r.pages, 1, 'claimed');
    // Changes and absence of every hidden source are irrelevant to this reader, not to commands.
    for (const [key, row] of m.records) if (!/^(quest|contract)\//.test(key)) row.value = { corrupt: true };
    expect(await listAcceptedQuests(r.pages, 1, 'claimed')).toEqual(expected);
    for (const key of [...m.records.keys()]) if (!/^(quest|contract)\//.test(key)) m.records.delete(key);
    expect(await readAcceptedQuest(r.pages, f.ref)).toEqual(expected.rows[0]);
    expect(await listAcceptedQuests(m.pages, 1, 'claimed')).toEqual(expected);
    await expect(loadAcceptedQuest(m.pages, f.contract)).rejects.toThrow('missing established world record');
  });

  it.each(['active', 'complete', 'claimed'] as const)('paginates only %s on the chosen floor with at most four candidates', async status => {
    const m = questMemory(), expected = [];
    for (let n = 0; n < 9; n++) expected.push((await addQuest(m, `vault-${n}`, status)).record.key);
    await addQuest(m, 'other-floor', status, 2);
    await addQuest(m, 'other-status', status === 'active' ? 'complete' : 'active');
    const offer = await addQuest(m, 'offer', status);
    m.records.delete(offer.record.key); offer.contract.accepted = false;
    for (const count of [1, 2, 3, 4]) {
      const r = restricted(m), seen: string[] = [], sizes: number[] = [];
      let after: string | undefined;
      do {
        const page = await listAcceptedQuests(r.pages, 1, status, after, count);
        expect(page.rows.length).toBeLessThanOrEqual(count); sizes.push(page.rows.length);
        seen.push(...page.rows.map(row => row.record.key));
        if (page.next) expect(page.next).toBe(questIndexes(page.rows.at(-1)!.quest)[0]);
        after = page.next;
      } while (after && sizes.length < 12);
      expect(after).toBeUndefined(); expect(seen).toEqual(expected.sort());
      expect(r.scan).toHaveBeenCalledTimes(Math.ceil(9 / count));
      expect(sizes).toEqual(Array.from({ length: Math.ceil(9 / count) }, (_, n) => Math.min(count, 9 - n * count)));
      expect(r.get).toHaveBeenCalledTimes(18);
      expect(await listAcceptedQuests(r.pages, 3, status)).toEqual({ rows: [] });
    }
  });

  it('can read detail using get only and refuses an obsolete exact record ID', async () => {
    const m = questMemory(), f = await addQuest(m), r = restricted(m);
    expect(await readAcceptedQuest(r.pages, f.ref)).toEqual({ record: f.record, quest: f.quest });
    expect(r.scan).not.toHaveBeenCalled();
    await expect(readAcceptedQuest(r.pages, { ...f.ref, id: 'other-record' })).rejects.toThrow('referenced record');
    f.record.id = 'replacement-record';
    await expect(readAcceptedQuest(r.pages, f.ref)).rejects.toThrow('referenced record');
  });
});

type Fixture = Awaited<ReturnType<typeof addQuest>>;
const corruptions: [string, (f: Fixture) => void][] = [
  ['quest key', f => { f.record.key = 'quest/other'; }],
  ['quest body ID', f => { f.quest.quest.id = 'other'; }],
  ['quest record ID', f => { f.record.id = 'invalid/id'; }],
  ['quest area', f => { f.record.area = 'knowledge'; }],
  ['quest revision', f => { f.record.revision = -1; }],
  ['quest floor index', f => { f.record.indexes[0] = 'quests/floor/2/active/other'; }],
  ['quest target index', f => { f.record.indexes[1] = 'quests/target/1/other/active/other'; }],
  ['extra quest index', f => { f.record.indexes.push('extra'); }],
  ['missing quest indexes', f => { f.record.indexes = []; }],
  ['contract key', f => { f.contractRecord.key = 'contract/other'; }],
  ['contract body ID', f => { f.contract.contract.id = 'other'; }],
  ['contract record ID', f => { f.contractRecord.id = ''; }],
  ['contract area', f => { f.contractRecord.area = 'execution'; }],
  ['contract game', f => { f.contractRecord.gameId = 'other-game'; }],
  ['contract generation', f => { f.contractRecord.generation = 'other-generation'; }],
  ['contract index', f => { f.contractRecord.indexes = ['contracts/2/other']; }],
  ['extra contract index', f => { f.contractRecord.indexes.push('extra'); }],
  ['unaccepted contract', f => { f.contract.accepted = false; }],
  ['malformed acceptance', f => { Object.assign(f.contract, { accepted: 'yes' }); }],
  ['quest schema', f => { Object.assign(f.quest, { schema: 2 }); }],
  ['contract schema', f => { Object.assign(f.contract, { schema: 2 }); }],
  ['unknown quest field', f => { Object.assign(f.quest.quest, { ignored: true }); }],
  ['quest status', f => { Object.assign(f.quest.quest, { status: 'posted' }); }],
  ['quest progress', f => { f.quest.quest.task.progress = 10; }],
  ['quest award shape', f => { f.quest.award = { itemId: 'other', chestId: 'chest' }; }],
  ['contract shape', f => { Object.assign(f.contract.contract, { ignored: true }); }],
  ['contract task shape', f => { f.contract.contract.task.required = 0; }],
  ['floor mismatch', f => { f.contract.contract.floor = 2; f.contractRecord.indexes = [`contracts/2/${f.quest.quest.id}`]; }],
  ...(['originRoomId', 'targetRoomId', 'targetRoomName', 'title', 'description'] as const)
    .map(field => [field, (f: Fixture) => { f.contract.contract[field] = 'other'; }] as [string, (f: Fixture) => void]),
  ['target kind', f => { f.contract.contract.targetRoomKind = 'ordinary'; }],
  ['task objective', f => { const c = f.contract.contract; c.objective = c.task.objective = 'scout'; delete c.task.item; }],
  ['task noun', f => { f.contract.contract.task.noun = 'Other'; }],
  ['task required', f => { f.contract.contract.task.required++; }],
  ...(['baseId', 'displayName', 'token'] as const)
    .map(field => [`task item ${field}`, (f: Fixture) => { f.contract.contract.task.item![field] = 'Other'; }] as [string, (f: Fixture) => void]),
  ['reward', f => { f.contract.contract.rewardGold++; }],
];

describe('accepted quest integrity', () => {
  it.each(corruptions)('rejects %s in list and detail', async (_label, alter) => {
    const m = questMemory(), f = await addQuest(m), r = restricted(m); alter(f);
    // Retain the original index pointer so index corruption cannot masquerade as an empty page.
    r.scan.mockResolvedValue({ rows: [structuredClone(f.record)] });
    await expect(listAcceptedQuests(r.pages, 1, 'active')).rejects.toThrow();
    await expect(readAcceptedQuest(r.pages, f.ref)).rejects.toThrow();
  });
  it.each(['quest', 'contract'] as const)('fails closed when the %s record is missing', async kind => {
    const m = questMemory(), f = await addQuest(m), r = restricted(m);
    r.scan.mockResolvedValue({ rows: [structuredClone(f.record)] });
    m.records.delete(kind === 'quest' ? f.record.key : f.contractRecord.key);
    await expect(listAcceptedQuests(r.pages, 1, 'active')).rejects.toThrow('missing');
    await expect(readAcceptedQuest(r.pages, f.ref)).rejects.toThrow('missing');
  });
  it.each(['id', 'body'] as const)('rejects a scan/primary %s mismatch', async defect => {
    const m = questMemory(), f = await addQuest(m), r = restricted(m), candidate = structuredClone(f.record);
    if (defect === 'id') candidate.id = 'stale-record';
    else candidate.value = json({ ...f.quest, quest: { ...f.quest.quest, title: 'Changed' } });
    r.scan.mockResolvedValue({ rows: [candidate] });
    await expect(listAcceptedQuests(r.pages, 1, 'active')).rejects.toThrow();
  });
  it.each(['status', 'floor'] as const)('rejects a coherent row outside the requested %s', async defect => {
    const m = questMemory(), f = await addQuest(m, 'vault', defect === 'status' ? 'complete' : 'active', defect === 'floor' ? 2 : 1);
    const r = restricted(m); r.scan.mockResolvedValue({ rows: [f.record] });
    await expect(listAcceptedQuests(r.pages, 1, 'active')).rejects.toThrow('floor or status');
  });
});

describe('accepted quest query bounds', () => {
  it.each([0, -1, 1.5, 5, NaN, Infinity])('rejects count %s before reads', async count => {
    const r = restricted(questMemory());
    await expect(listAcceptedQuests(r.pages, 1, 'active', undefined, count)).rejects.toThrow('page size');
    expect(r.get).not.toHaveBeenCalled(); expect(r.scan).not.toHaveBeenCalled();
  });
  it.each([
    [0, 'active'], [1.5, 'active'], [NaN, 'active'], [Infinity, 'active'], [1, 'posted'], [1, 'all'],
  ])('rejects floor/status %s/%s before reads', async (floor, status) => {
    const r = restricted(questMemory());
    await expect(listAcceptedQuests(r.pages, floor as number, status as QuestStatus)).rejects.toThrow();
    expect(r.get).not.toHaveBeenCalled(); expect(r.scan).not.toHaveBeenCalled();
  });
  it.each(['', 'quests/floor/1/active/', 'quests/floor/2/active/id', 'quests/floor/01/active/id',
    'quests/floor/1/complete/id', 'quests/target/1/vault/active/id', 'quest/id',
    'quests/floor/1/active/a/b', `quests/floor/1/active/${'a'.repeat(129)}`])('rejects invalid cursor %s before reads', async after => {
    const r = restricted(questMemory());
    await expect(listAcceptedQuests(r.pages, 1, 'active', after)).rejects.toThrow('cursor');
    expect(r.get).not.toHaveBeenCalled(); expect(r.scan).not.toHaveBeenCalled();
  });
  it.each(['contract/id', 'dungeon/1/space/id', 'quest/', 'quest/a/b'])('rejects detail key %s before reads', async key => {
    const r = restricted(questMemory());
    await expect(readAcceptedQuest(r.pages, { key, id: 'record' })).rejects.toThrow('reference');
    expect(r.get).not.toHaveBeenCalled(); expect(r.scan).not.toHaveBeenCalled();
  });
  it.each(['oversized', 'duplicate', 'reversed', 'before-cursor', 'foreign-next', 'skipping-next', 'empty-next'] as const)(
    'rejects %s scan results without scanning again', async defect => {
      const m = questMemory(), a = await addQuest(m, 'a'), b = await addQuest(m, 'b'), r = restricted(m);
      const first = questIndexes(a.quest)[0], last = questIndexes(b.quest)[0];
      const rows = defect === 'oversized' ? Array(5).fill(a.record) : defect === 'duplicate' ? [a.record, a.record]
        : defect === 'reversed' ? [b.record, a.record] : defect === 'empty-next' ? [] : [a.record, b.record];
      const next = defect === 'foreign-next' ? last.replace('/1/', '/2/') : defect === 'skipping-next'
        ? `${last}-later` : defect === 'empty-next' ? first : undefined;
      r.scan.mockResolvedValue({ rows, ...(next === undefined ? {} : { next }) });
      await expect(listAcceptedQuests(r.pages, 1, 'active', defect === 'before-cursor' ? last : undefined, 2)).rejects.toThrow();
      expect(r.scan).toHaveBeenCalledTimes(1); expect(r.get.mock.calls.length).toBeLessThanOrEqual(4);
    });
});

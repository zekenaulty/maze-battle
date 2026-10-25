// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCanonical } from '../read';
import { DEFAULT_QUOTA } from '../types';
import { readCanonicalQuestJournal, QUEST_JOURNAL_PAGE_SIZE } from './journal';
import { journalFixture, journalSnapshot as snapshot } from './journal.test-support';
import { chestKey, questIndexes, roomContentKey } from './records';

vi.mock('../read', () => ({ readCanonical: vi.fn() }));
let f: ReturnType<typeof journalFixture>;
beforeEach(() => {
  f = journalFixture();
  vi.mocked(readCanonical).mockImplementation(async (query, options) => {
    if (!options?.snapshot) throw Error('Snapshot required');
    options.signal?.throwIfAborted();
    const pinned = structuredClone(options.snapshot);
    return { value: await query(f.query, pinned), snapshot: pinned,
      head: { ...pinned, schema: 1, status: 'ready', owner: 'owner', epoch: 1, allocations: {},
        quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0 } },
      stats: { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 } };
  });
});
afterEach(() => vi.clearAllMocks());

it('pages retained floors and every accepted status in eight-row index order without disclosing sources', async () => {
  const expected = [];
  for (let i = 0; i < 19; i++) expected.push(await f.add(i % 3 === 0 ? 12 : i % 3 + 1, `vault-${i}`,
    i % 3 === 0 ? 'claimed' : i % 3 === 1 ? 'active' : 'complete'));
  const offer = await f.add(99, 'unaccepted'); f.records.delete(offer.record.key); offer.contract.accepted = false;
  const before = structuredClone(f.records), signal = new AbortController().signal;
  const first = await readCanonicalQuestJournal(snapshot, undefined, signal);
  const second = await readCanonicalQuestJournal(snapshot, first.value.next, signal);
  const third = await readCanonicalQuestJournal(snapshot, second.value.next, signal);
  expect(QUEST_JOURNAL_PAGE_SIZE).toBe(8);
  expect([first, second, third].map(page => page.value.entries.length)).toEqual([8, 8, 3]);
  expect(third.value.next).toBeUndefined();
  expected.sort((a, b) => questIndexes(a.quest)[0] < questIndexes(b.quest)[0] ? -1 : 1);
  expect([first, second, third].flatMap(page => page.value.entries)).toEqual(expected.map(({ quest: { quest: q } }) => ({
    id: q.id, title: q.title, floor: q.floor, status: q.status, progress: q.task.progress,
    required: q.task.required, noun: q.task.noun, rewardGold: q.reward.gold,
  })));
  expect(f.scan.mock.calls).toEqual([undefined, first.value.next?.after, second.value.next?.after]
    .map(after => ['world', 'quests/floor/', after, 8]));
  expect(f.get.mock.calls.some(([, key]) => key.includes('unaccepted'))).toBe(false);
  expect(f.records).toEqual(before);
  expect(vi.mocked(readCanonical).mock.calls.every(([, options]) =>
    JSON.stringify(Object.keys(options!).sort()) === JSON.stringify(['signal', 'snapshot']))).toBe(true);
  expect(vi.mocked(readCanonical).mock.calls[0][1]).toEqual({ snapshot, signal });
});

it('bounds exact content reads to the displayed eight quests and their required award sources', async () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(await f.add(i + 1, `vault-${i}`, 'claimed'));
  rows.sort((a, b) => questIndexes(a.quest)[0] < questIndexes(b.quest)[0] ? -1 : 1);
  for (const row of rows.slice(8)) row.contractRecord.value = { corrupt: true };
  await readCanonicalQuestJournal(snapshot);
  const allowed = new Set(rows.slice(0, 8).flatMap(({ quest: { quest: q, award } }) =>
    [`quest/${q.id}`, `contract/${q.id}`, roomContentKey(q.floor, q.targetRoomId), chestKey(q.floor, award!.chestId)]));
  expect(f.get.mock.calls.every(([, key]) => allowed.has(key))).toBe(true);
  expect(f.get).toHaveBeenCalledTimes(8 * 7); // Repeated exact reads use the canonical transaction cache in production.
  expect(f.scan).toHaveBeenCalledTimes(1);
});

it.each(['primary', 'contract', 'room', 'award', 'missing'] as const)('refuses corrupt %s evidence, not an empty/partial success', async defect => {
  const row = await f.add(8, 'vault', 'complete'), before = structuredClone(row.record);
  if (defect === 'primary') f.scan.mockResolvedValueOnce({ rows: [{ ...before, value: { corrupt: true } }] });
  if (defect === 'contract') row.contract.contract.rewardGold++;
  if (defect === 'room') f.records.get(roomContentKey(8, 'vault'))!.value = { schema: 1, level: 8, spaceId: 'vault', chestId: 'chest-vault', contractId: 'other' };
  if (defect === 'award') f.records.get(chestKey(8, 'chest-vault'))!.value = { schema: 1, spaceId: 'vault', chest: { id: 'chest-vault', level: 8, position: { row: 1, column: 2 }, opened: false } };
  if (defect === 'missing') { f.scan.mockResolvedValueOnce({ rows: [before] }); f.records.delete(row.record.key); }
  await expect(readCanonicalQuestJournal(snapshot)).rejects.toThrow();
});

it.each(['oversized', 'reversed', 'duplicate', 'short-next', 'foreign-next', 'skipping-next'] as const)('rejects %s page evidence', async defect => {
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push((await f.add(1, `vault-${i}`)).record);
  const normal = await f.pages.scan('world', 'quests/floor/', undefined, 8);
  f.scan.mockResolvedValueOnce(defect === 'oversized' ? { rows } : defect === 'reversed' ? { rows: normal.rows.slice().reverse() }
    : defect === 'duplicate' ? { rows: [normal.rows[0], normal.rows[0]] }
      : { rows: defect === 'short-next' ? normal.rows.slice(0, 1) : normal.rows,
        next: defect === 'foreign-next' ? 'contracts/1/other' : `${normal.next}-other` });
  await expect(readCanonicalQuestJournal(snapshot)).rejects.toThrow();
});

it.each(['generation', 'gameId', 'revision', 'world', 'checkpoint'] as const)('rejects cursor %s changes before opening storage', async field => {
  const changed = structuredClone(snapshot);
  if (field === 'world') changed.roots.world = 'other';
  else if (field === 'checkpoint') changed.checkpoint = { mode: 'manual' };
  else if (field === 'revision') changed.revision++;
  else changed[field] = 'other';
  await expect(readCanonicalQuestJournal(snapshot, { snapshot: changed, after: 'quests/floor/1/active/id' })).rejects.toThrow('stale or foreign journal cursor');
  expect(readCanonical).not.toHaveBeenCalled();
});

it.each(['', 'quests/floor/01/active/id', 'quests/floor/1/posted/id', 'quests/floor/1/active/a/b',
  'quests/floor/9007199254740992/active/id', 'contracts/1/id'])('rejects malformed cursor %s before reads', async after => {
  await expect(readCanonicalQuestJournal(snapshot, { snapshot, after })).rejects.toThrow('invalid journal cursor');
  expect(readCanonical).not.toHaveBeenCalled();
});

it('requires cursor membership, exact codec fields and forwards cancellation', async () => {
  await expect(readCanonicalQuestJournal(snapshot, { snapshot, after: 'quests/floor/1/active/missing' })).rejects.toThrow('not an accepted entry');
  const cursor = { snapshot, after: 'quests/floor/1/active/id', extra: true };
  await expect(readCanonicalQuestJournal(snapshot, cursor)).rejects.toThrow('invalid roster fields');
  const controller = new AbortController(); controller.abort();
  await expect(readCanonicalQuestJournal(snapshot, undefined, controller.signal)).rejects.toThrow();
  expect(f.scan).not.toHaveBeenCalled();
});

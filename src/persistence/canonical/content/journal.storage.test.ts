// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { protocolHead } from '../agentica/types.test-support';
import { workBudget } from '../budget';
import { openCanonicalDatabase } from '../database';
import { CanonicalPages } from '../pages';
import { snapshotOf } from '../read';
import { DEFAULT_WORK_LIMITS, type CanonicalIndexNode, type CanonicalRecord, type CanonicalWrite } from '../types';
import { readCanonicalQuestJournal } from './journal';
import { journalFixture } from './journal.test-support';

vi.mock('../database', () => ({ openCanonicalDatabase: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('uses real snapshot trees and default read budgets without writes or current-root fallback', async () => {
  // Only IDB transport is in memory. CanonicalPages, cursor validation and readCanonical are real.
  const head = protocolHead(), records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>();
  const store = (name: string) => ({ get: async (key: unknown) => {
    if (name === 'meta' && key === 'schema') return { schema: 1, gameId: head.gameId, generation: head.generation };
    if (name === 'heads' && key === head.gameId) return structuredClone(head);
    if (!Array.isArray(key) || key[0] !== head.gameId) throw Error('Unexpected storage key');
    if (name === 'records') return structuredClone(records.get(key[1]));
    if (name === 'nodes') return structuredClone(nodes.get(key[1]));
    throw Error(`Unexpected store: ${name}`);
  } });
  const setup = { mode: 'readwrite', objectStore: store } as unknown as CanonicalWrite;
  async function commit(rows: CanonicalRecord[]) {
    const pages = new CanonicalPages(setup, head, workBudget());
    for (const row of rows) await pages.set('world', row.key, row.value, row.indexes);
    const staged = await pages.prepare();
    for (const row of staged.records) records.set(row.id, row);
    for (const row of staged.nodes) nodes.set(row.node.id, row);
    head.roots = staged.roots; head.revision++;
  }
  const fixture = journalFixture();
  for (let i = 1; i <= 12; i++) {
    fixture.records.clear();
    await fixture.add(i, 'vault', 'claimed');
    await commit([...fixture.records.values()]);
  }
  const snapshot = snapshotOf(head), close = vi.fn(), abort = vi.fn();
  const transaction = vi.fn((_stores: unknown, mode: string) => {
    expect(mode).toBe('readonly');
    return { mode, objectStore: store, done: Promise.resolve(), abort };
  });
  const db = { transaction, close } as unknown as Awaited<ReturnType<typeof openCanonicalDatabase>>;
  vi.mocked(openCanonicalDatabase).mockResolvedValue(db);
  const before = structuredClone({ records, nodes, head });
  const first = await readCanonicalQuestJournal(snapshot);
  const second = await readCanonicalQuestJournal(snapshot, first.value.next);
  expect(first.value.entries).toHaveLength(8); expect(second.value.entries).toHaveLength(4);
  expect(second.value.next).toBeUndefined();
  expect({ records, nodes, head }).toEqual(before);
  for (const page of [first, second]) {
    expect(page.stats.writes).toBe(0); expect(page.stats.writeBytes).toBe(0);
    expect(page.stats.reads).toBeGreaterThan(2); expect(page.stats.reads).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.reads);
    expect(page.stats.readBytes).toBeGreaterThan(0); expect(page.stats.readBytes).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.bytes);
  }
  console.info(JSON.stringify({ journalPages: [first, second].map(page => ({ rows: page.value.entries.length, ...page.stats })) }));
  fixture.records.clear(); await fixture.add(1, 'vault', 'active');
  await commit([...fixture.records.values()]);
  const replay = await readCanonicalQuestJournal(snapshot);
  expect(replay.value).toEqual(first.value);
  const current = await readCanonicalQuestJournal(snapshotOf(head));
  expect(current.value.entries.find(q => q.floor === 1)?.status).toBe('active');
  await expect(readCanonicalQuestJournal(snapshotOf(head), first.value.next)).rejects.toThrow('stale or foreign journal cursor');
  expect(transaction).toHaveBeenCalledTimes(4); expect(close).toHaveBeenCalledTimes(4); expect(abort).not.toHaveBeenCalled();
});

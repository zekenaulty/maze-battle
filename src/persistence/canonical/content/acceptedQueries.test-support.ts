import { expect, vi } from 'vitest';
import { createGuildContract } from '../../../domain/guild/contractFactory';
import { roster } from '../../../domain/items/roster.testSupport';
import { advanceQuestProgress, claimQuest, questFromContract } from '../../../domain/quests/questRules';
import type { QuestStatus } from '../../../domain/types';
import type { CanonicalPages } from '../pages';
import type { CanonicalRecord } from '../types';
import { finishQuality, qualityFixture } from '../world/quality.test-support';
import { advanceWorldRoomRoles, beginWorldRoomRoles } from '../world/roles';
import type { WorldRead } from '../world/types';
import { advanceWorldContent, beginWorldContent } from './preparation';
import { acceptQuest } from './questActions';
import { contentKey, saveContract, saveQuest } from './records';
import type { StoredContract, StoredQuest } from './types';

export const now = '2026-10-20T00:00:00.000Z';
const identity = { generation: 'generation', gameId: 'game' };

export function questMemory(records = new Map<string, CanonicalRecord>()) {
  for (const [key, row] of records) Object.assign(row, identity, { key, area: 'world', indexes: [], revision: 1 });
  const pages = {
    get: async (_area, key) => structuredClone(records.get(key)),
    set: async (area, key, value, indexes = []) => {
      const row: CanonicalRecord = { ...identity, id: crypto.randomUUID(), revision: 1, area, key, indexes, value };
      records.set(key, structuredClone(row)); return structuredClone(row);
    },
    scan: async (_area, prefix, after, count = 16) => {
      const entries = [...records.values()].flatMap(record => record.indexes
        .filter(index => index.startsWith(prefix) && (after === undefined || index > after)).map(index => ({ index, record })))
        .sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0);
      return { rows: structuredClone(entries.slice(0, count).map(entry => entry.record)),
        ...(entries.length > count ? { next: entries[count - 1].index } : {}) };
    },
  } satisfies Pick<CanonicalPages, 'get' | 'set' | 'scan'>;
  return { records, pages: pages as CanonicalPages };
}

export async function addQuest(m: ReturnType<typeof questMemory>, target = 'vault', status: QuestStatus = 'active', floor = 1) {
  const contract = createGuildContract({ floor, originRoomId: 'hub', target: { id: target, kind: 'treasure', name: 'Vault' } });
  let quest = questFromContract(contract, now);
  if (status !== 'active') quest = advanceQuestProgress(quest, quest.task.required, now);
  if (status === 'claimed') quest = claimQuest(quest, now)!.quest;
  await saveContract(m.pages, { schema: 1, contract, accepted: true });
  await saveQuest(m.pages, { schema: 1, quest, award: status === 'active' ? null
    : { itemId: `quest-item:${quest.id}`, chestId: `chest-${target}` } });
  return pair(m, quest.id);
}

export function pair(m: ReturnType<typeof questMemory>, id: string) {
  const record = m.records.get(contentKey('quest', id))!, contractRecord = m.records.get(contentKey('contract', id))!;
  return { record, contractRecord, quest: record.value as unknown as StoredQuest,
    contract: contractRecord.value as unknown as StoredContract, ref: { key: record.key, id: record.id } };
}

/** Real seeded geometry/content and acceptance rules, with storage only held in memory. */
export async function seededQuest() {
  const world = qualityFixture(), m = questMemory(world.rows);
  m.pages.witness = world.pages.witness.bind(world.pages);
  await finishQuality({ ...world, pages: m.pages });
  let roles = await beginWorldRoomRoles(m.pages, 1);
  for (let n = 0; n < 16 && !roles.plan; n++) roles = await advanceWorldRoomRoles(m.pages, 1);
  expect(roles.plan).not.toBeNull();
  let content = await beginWorldContent(m.pages, 1);
  for (let n = 0; n < 32 && content.nextRoom < content.binding.roomCount; n++) content = await advanceWorldContent(m.pages, 1);
  expect(content.nextRoom).toBe(content.binding.roomCount);
  const posted = [...m.records.values()].find(row => row.key.startsWith('contract/')
    && (row.value as unknown as StoredContract).contract.objective === 'fetch')!;
  const contract = (posted.value as unknown as StoredContract).contract;
  const party = await acceptQuest(m.pages, contract.id, { level: 1, cell: { spaceId: 'entry', row: 0, column: 0 } },
    roster([], { dungeonLevel: 1 }), now);
  return { ...m, ...pair(m, contract.id), party };
}

export function restricted(m: ReturnType<typeof questMemory>) {
  const get = vi.fn<WorldRead['get']>(async (area, key) => {
    expect(area).toBe('world');
    expect(key).toMatch(/^(quest|contract)\/[A-Za-z0-9_.:-]{1,128}$/);
    return m.pages.get(area, key);
  });
  const scan = vi.fn<WorldRead['scan']>(async (area, prefix, after, count) => {
    expect(area).toBe('world'); expect(prefix).toMatch(/^quests\/floor\/[1-9][0-9]*\/(active|complete|claimed)\/$/);
    expect(count).toBeGreaterThanOrEqual(1); expect(count).toBeLessThanOrEqual(4);
    return m.pages.scan(area, prefix, after, count);
  });
  const pages = new Proxy({ get, scan }, { get(target, key) {
    if (!Object.hasOwn(target, key)) throw Error(`Forbidden reader operation: ${String(key)}`);
    return Reflect.get(target, key);
  } });
  return { pages, get, scan };
}

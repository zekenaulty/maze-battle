import { expect, vi } from 'vitest';
import { roster } from '../../../domain/items/roster.testSupport';
import { questItemForChest } from '../../../domain/quests/questItems';
import { questFromContract } from '../../../domain/quests/questRules';
import type { QuestStatus } from '../../../domain/types';
import { rosterKey } from '../roster/records';
import type { ContainerHeader, StoredItem } from '../roster/types';
import { seedRoster } from '../roster/write';
import type { WorldRead } from '../world/types';
import { addQuest, now, questMemory } from './acceptedQueries.test-support';

export async function carriedFixture(owner: 'pack' | 'stash' | null = 'pack', status: QuestStatus = 'complete') {
  const m = questMemory(), accepted = await addQuest(m, 'vault', status);
  const item = questItemForChest(questFromContract(accepted.contract.contract, now),
    { floor: 1, opened: false, targetEligible: true, ownedCount: 0, alreadyAwarded: false })!;
  const state = roster(owner === 'pack' ? [item] : [], { dungeonLevel: 1,
    stash: { capacity: 96, items: owner === 'stash' ? [item] : [] } });
  await seedRoster(m.pages, state);
  const key = rosterKey('item', item.id), prefix = `roster/quest-items/${item.questId}/`;
  const ownershipIndex = m.records.get(key)?.indexes[0];
  const allowed = new Set([accepted.record.key, accepted.contractRecord.key, key, 'roster/pack', 'roster/stash']);
  const get = vi.fn<WorldRead['get']>(async (area, key) => {
    expect(area).toBe('world'); expect(allowed.has(key), `Forbidden read: ${key}`).toBe(true);
    return m.pages.get(area, key);
  });
  const scan = vi.fn<WorldRead['scan']>(async (area, selected, after, count) => {
    expect([area, after, count]).toEqual(['world', undefined, 1]);
    expect(selected === prefix || ownershipIndex !== undefined && selected === ownershipIndex).toBe(true);
    return m.pages.scan(area, selected, after, count);
  });
  const pages = new Proxy({ get, scan }, { get(target, key) {
    if (!Object.hasOwn(target, key)) throw Error(`Forbidden carried quest operation: ${String(key)}`);
    return Reflect.get(target, key);
  } });
  const itemRecord = m.records.get(key), packRecord = m.records.get('roster/pack')!, stashRecord = m.records.get('roster/stash')!;
  return { ...m, ...accepted, state, pages, get, scan, key, prefix, itemRecord,
    stored: itemRecord?.value as unknown as StoredItem, packRecord, stashRecord,
    pack: packRecord.value as unknown as ContainerHeader, stash: stashRecord.value as unknown as ContainerHeader };
}

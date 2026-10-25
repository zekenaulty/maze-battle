import { vi } from 'vitest';
import { createItemInstance } from '../../../domain/items/loot';
import { questItemForChest } from '../../../domain/quests/questItems';
import type { QuestStatus } from '../../../domain/types';
import type { CanonicalQuery } from '../read';
import { encodeItem } from '../roster/itemValidation';
import type { CanonicalSnapshot } from '../types';
import { json } from '../world/records';
import { addQuest, questMemory } from './acceptedQueries.test-support';
import { roomContentKey, saveChest } from './records';

export const journalSnapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
  roots: { world: 'world', knowledge: 'knowledge', execution: null }, checkpoint: { mode: 'town' } };

export function journalFixture() {
  const m = questMemory();
  const get = vi.fn<CanonicalQuery['get']>(async (area, key) => {
    if (area !== 'world' || !/^(quest\/|contract\/|dungeon\/[1-9][0-9]*\/(content|chest)\/)/.test(key))
      throw Error(`Unexpected journal source: ${area}/${key}`);
    return m.pages.get(area, key);
  });
  const scan = vi.fn<CanonicalQuery['scan']>(async (area, prefix, after, count) => {
    if (area !== 'world' || prefix !== 'quests/floor/' || count !== 8) throw Error('Unexpected journal scan');
    return m.pages.scan(area, prefix, after, count);
  });
  const forbidden = async () => { throw Error('Unexpected journal query'); };
  const pages: CanonicalQuery = { get, scan, witness: forbidden, savedSnapshot: forbidden, sourceReceipt: forbidden, liveOperation: forbidden };
  async function add(floor: number, target: string, status: QuestStatus = 'active') {
    const f = await addQuest(m, target, status, floor), q = f.quest.quest, chestId = `chest-${target}`;
    await m.pages.set('world', roomContentKey(floor, target), json({ schema: 1, level: floor, spaceId: target, contractId: q.id, chestId }));
    if (status !== 'active') {
      const item = questItemForChest({ ...q, status: 'active' }, { floor, opened: false, targetEligible: true, ownedCount: 0, alreadyAwarded: false });
      if (!item) throw Error('Fixture requires an earned quest item');
      await saveChest(m.pages, { schema: 1, spaceId: target, chest: { id: chestId, level: floor,
        position: { row: 1, column: 2 }, opened: true, loot: [encodeItem(createItemInstance('health-herb', floor)), item] } });
    }
    return f;
  }
  return { ...m, add, query: pages, get, scan };
}

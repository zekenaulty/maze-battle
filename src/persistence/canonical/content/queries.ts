import type { QuestStatus } from '../../../domain/types';
import { check, integer } from '../validation';
import { levelKey, same } from '../world/records';
import type { WorldRead } from '../world/types';
import { contentKey, loadChest, loadContract, loadRoomContent, loadAcceptedQuest, questIndexes } from './records';
import { storedQuest } from './validation';

function limit(count: number) { check(integer(count, 1) && count <= 16, 'invalid content page size'); }

/** Internal authoritative pages. Apply earned-knowledge projection before UI/agent disclosure. */
export async function listFloorContracts(pages: WorldRead, level: number, after?: string, count = 8) {
  levelKey(level); limit(count);
  const page = await pages.scan('world', `contracts/${level}/`, after, count), contracts = [];
  for (const record of page.rows) {
    const identity = record.key.slice('contract/'.length), row = await loadContract(pages, identity), c = row.contract;
    check(record.key === contentKey('contract', c.id) && c.floor === level
      && same(record.indexes, [`contracts/${level}/${c.id}`]), 'invalid floor contract index');
    // Accepted quests have their own bounded pages. Already-open caches cannot offer a new fetch.
    await loadAcceptedQuest(pages, row);
    if (row.accepted) continue;
    if (c.objective === 'fetch') {
      const room = await loadRoomContent(pages, level, c.targetRoomId);
      check(room.chestId, 'fetch contract has no chest');
      if ((await loadChest(pages, level, room.chestId)).chest.opened) continue;
    }
    contracts.push(c);
  }
  return { contracts, ...(page.next === undefined ? {} : { next: page.next }) };
}

export async function listFloorQuests(pages: WorldRead, level: number, status: QuestStatus, after?: string, count = 8) {
  levelKey(level); limit(count); check(['active', 'complete', 'claimed'].includes(status), 'invalid quest page status');
  const page = await pages.scan('world', `quests/floor/${level}/${status}/`, after, count), quests = [];
  for (const record of page.rows) {
    const row = storedQuest(record.value), q = row.quest;
    check(q.floor === level && q.status === status && record.key === contentKey('quest', q.id)
      && same(record.indexes, questIndexes(row)), 'invalid floor quest index');
    await loadAcceptedQuest(pages, await loadContract(pages, q.id));
    quests.push(q);
  }
  return { quests, ...(page.next === undefined ? {} : { next: page.next }) };
}

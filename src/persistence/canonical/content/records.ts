import type { CanonicalPages } from '../pages';
import { matchesQuestItem } from '../../../domain/quests/questItems';
import { check } from '../validation';
import { id } from '../roster/codec';
import { entityKey, json, required, same } from '../world/records';
import type { WorldRead } from '../world/types';
import type { StoredChest, StoredContract, StoredQuest } from './types';
import { roomContent, storedChest, storedContract, storedQuest } from './validation';

export const contentKey = (kind: 'contract' | 'quest', identity: string) => { id(identity); return `${kind}/${identity}`; };
export const chestKey = (level: number, identity: string) => entityKey(level, 'chest', identity);
export const roomContentKey = (level: number, identity: string) => entityKey(level, 'content', identity);
export const questIndexes = ({ quest }: StoredQuest) => [
  `quests/floor/${quest.floor}/${quest.status}/${quest.id}`,
  `quests/target/${quest.floor}/${quest.targetRoomId}/${quest.status}/${quest.id}`,
];
export async function loadRoomContent(pages: WorldRead, level: number, identity: string) {
  const row = roomContent(await required(pages, roomContentKey(level, identity)));
  check(row.level === level && row.spaceId === identity, 'foreign room content'); return row;
}
export async function loadChest(pages: WorldRead, level: number, identity: string) {
  const row = storedChest(await required(pages, chestKey(level, identity)));
  check(row.chest.level === level && row.chest.id === identity, 'foreign chest');
  check((await loadRoomContent(pages, level, row.spaceId)).chestId === identity, 'chest is not assigned to room');
  return row;
}
export async function loadContract(pages: WorldRead, identity: string) {
  const row = storedContract(await required(pages, contentKey('contract', identity))), c = row.contract;
  check(c.id === identity && (await loadRoomContent(pages, c.floor, c.targetRoomId)).contractId === identity, 'foreign guild contract');
  return row;
}
export async function loadRoomContract(pages: WorldRead, level: number, spaceId: string) {
  const room = await loadRoomContent(pages, level, spaceId);
  if (!room.contractId) return null;
  const row = await loadContract(pages, room.contractId);
  check(row.contract.floor === level && row.contract.targetRoomId === spaceId, 'room contract is not reciprocal');
  return row;
}
export async function loadAcceptedQuest(pages: WorldRead, contract: StoredContract) {
  const record = await pages.get('world', contentKey('quest', contract.contract.id));
  check(contract.accepted === !!record, 'accepted quest record missing or contradictory');
  if (!record) return null;
  const row = storedQuest(record.value), q = row.quest, c = contract.contract;
  for (const field of ['id', 'floor', 'originRoomId', 'targetRoomId', 'targetRoomName', 'targetRoomKind', 'title', 'description'] as const)
    check(q[field] === c[field], 'quest contract identity changed');
  const { progress: _, ...task } = q.task;
  check(same(task, c.task) && q.reward.gold === c.rewardGold && same(record.indexes, questIndexes(row)), 'quest differs from accepted contract');
  if (row.award) {
    const source = await loadChest(pages, q.floor, row.award.chestId);
    check(source.spaceId === q.targetRoomId && source.chest.opened, 'quest award source is not an opened target chest');
    const matches = source.chest.loot!.filter(item => matchesQuestItem(item, q));
    check(matches.length === 1 && matches[0].id === row.award.itemId && matches[0].quantity === 1,
      'quest award source does not contain its collectible');
  }
  return row;
}
export async function saveQuest(pages: CanonicalPages, value: StoredQuest) {
  storedQuest(value); await pages.set('world', contentKey('quest', value.quest.id), json(value), questIndexes(value));
}
export async function saveContract(pages: CanonicalPages, value: StoredContract) {
  storedContract(value); const c = value.contract;
  await pages.set('world', contentKey('contract', c.id), json(value), [`contracts/${c.floor}/${c.id}`]);
}
export async function saveChest(pages: CanonicalPages, value: StoredChest) {
  storedChest(value); const c = value.chest;
  await pages.set('world', chestKey(c.level, c.id), json(value), [`chests/${c.level}/${value.spaceId}/${c.id}`]);
}

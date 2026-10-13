import type { GuildContract } from '../../../domain/guild/contracts';
import type { QuestState } from '../../../domain/types';
import { check, jsonBytes } from '../validation';
import { fields, id, natural, text, timestamp } from '../roster/codec';
import { validateItem } from '../roster/itemValidation';
import type { RoomContent, StoredChest, StoredContract, StoredQuest } from './types';

const roomKinds = ['start', 'hub', 'treasure', 'safe', 'boss', 'exit', 'ordinary'];
const objectives = ['scout', 'fetch', 'kill', 'locate'];
const monsterTags = ['vermin', 'beast', 'undead', 'reptile', 'arcane', 'construct', 'ooze'];
function target(row: Record<string, unknown>) {
  id(row.id); natural(row.floor, 1); id(row.originRoomId); id(row.targetRoomId);
  text(row.targetRoomName); text(row.title); text(row.description, 512);
  check(roomKinds.includes(row.targetRoomKind as string), 'invalid quest target kind');
}
function task(value: unknown, progress: boolean) {
  const row = fields(value, `objective noun required${progress ? ' progress' : ''}`, progress ? 'item monsterTags' : 'item');
  check(objectives.includes(row.objective as string), 'invalid quest objective');
  text(row.noun); natural(row.required, 1);
  if (progress) { natural(row.progress); check((row.progress as number) <= (row.required as number), 'quest progress exceeds target'); }
  if (row.item !== undefined) {
    check(row.objective === 'fetch', 'item on non-fetch quest');
    const item = fields(row.item, 'baseId displayName token'); id(item.baseId); text(item.displayName); text(item.token, 32);
  }
  if (row.monsterTags !== undefined) check(Array.isArray(row.monsterTags) && row.monsterTags.length <= monsterTags.length
    && row.monsterTags.every(tag => typeof tag === 'string' && monsterTags.includes(tag)) && new Set(row.monsterTags).size === row.monsterTags.length, 'invalid quest monster tags');
  return row;
}
export function validateContract(value: unknown): asserts value is GuildContract {
  jsonBytes(value, 4096);
  const row = fields(value, 'id floor originRoomId targetRoomId targetRoomName targetRoomKind objective task title description rewardGold status');
  target(row); natural(row.rewardGold); const t = task(row.task, false);
  check(t.objective === row.objective && ['posted', 'located', 'nearby'].includes(row.status as string), 'invalid guild contract');
}
export function validateQuest(value: unknown): asserts value is QuestState {
  jsonBytes(value, 4096);
  const row = fields(value, 'id source floor originRoomId targetRoomId targetRoomName targetRoomKind title description task reward status acceptedAt', 'completedAt claimedAt');
  target(row); task(row.task, true); natural(fields(row.reward, 'gold').gold); timestamp(row.acceptedAt);
  check(row.source === 'guild' && ['active', 'complete', 'claimed'].includes(row.status as string), 'invalid quest state');
  const done = row.status !== 'active';
  if (done) { timestamp(row.completedAt); check(row.completedAt >= row.acceptedAt, 'quest completion precedes acceptance'); }
  else check(row.completedAt === undefined && row.claimedAt === undefined, 'active quest has terminal timestamps');
  if (row.status === 'claimed') { timestamp(row.claimedAt); check(row.claimedAt >= (row.completedAt as string), 'quest claim precedes completion'); }
  else check(row.claimedAt === undefined, 'unclaimed quest has a claim timestamp');
  const t = row.task as Record<string, number>;
  check(done ? t.progress === t.required : t.progress < t.required, 'quest status contradicts progress');
}
export function roomContent(value: unknown): RoomContent {
  const row = fields(value, 'schema level spaceId chestId contractId');
  check(row.schema === 1, 'invalid room content schema'); natural(row.level, 1); id(row.spaceId);
  if (row.chestId !== null) id(row.chestId); if (row.contractId !== null) id(row.contractId);
  return value as RoomContent;
}
export function storedChest(value: unknown): StoredChest {
  const row = fields(value, 'schema spaceId chest'); check(row.schema === 1, 'invalid chest schema'); id(row.spaceId);
  const chest = fields(row.chest, 'id level position opened', 'loot'); id(chest.id); natural(chest.level, 1);
  const at = fields(chest.position, 'row column'); natural(at.row); natural(at.column);
  check((at.row as number) < 512 && (at.column as number) < 512 && typeof chest.opened === 'boolean', 'invalid chest position or state');
  if (chest.opened) {
    check(Array.isArray(chest.loot) && chest.loot.length >= 2 && chest.loot.length <= 4, 'invalid opened chest contents');
    const ids = new Set<string>();
    for (const item of chest.loot) { validateItem(item); check(!ids.has(item.id), 'duplicate chest loot identity'); ids.add(item.id); }
  } else check(chest.loot === undefined, 'unopened chest contains materialized loot');
  jsonBytes(value, 40 * 1024); return value as StoredChest;
}
export function storedContract(value: unknown): StoredContract {
  const row = fields(value, 'schema contract accepted');
  check(row.schema === 1 && typeof row.accepted === 'boolean', 'invalid stored contract'); validateContract(row.contract);
  return value as StoredContract;
}
export function storedQuest(value: unknown): StoredQuest {
  const row = fields(value, 'schema quest award'); check(row.schema === 1, 'invalid stored quest'); validateQuest(row.quest);
  check(row.quest.status === 'active' || row.quest.task.objective !== 'fetch' || !row.quest.task.item || row.award !== null,
    'completed fetch quest lacks award provenance');
  if (row.award !== null) {
    const award = fields(row.award, 'itemId chestId'); id(award.itemId); id(award.chestId);
    check(row.quest.task.objective === 'fetch' && row.quest.task.item && award.itemId === `quest-item:${row.quest.id}`, 'invalid quest award');
  }
  return value as StoredQuest;
}

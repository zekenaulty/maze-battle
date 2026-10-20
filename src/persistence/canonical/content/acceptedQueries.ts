import type { QuestStatus } from '../../../domain/types';
import type { CanonicalRecord } from '../types';
import { check, integer, record as validateRecord, validId } from '../validation';
import { fields } from '../roster/codec';
import { levelKey, same } from '../world/records';
import type { WorldRead } from '../world/types';
import { contentKey, questIndexes } from './records';
import type { StoredQuest } from './types';
import { storedContract, storedQuest } from './validation';

type AcceptedQuest = { record: CanonicalRecord; quest: StoredQuest };

function cursor(value: string, prefix: string) {
  check(typeof value === 'string' && value.startsWith(prefix) && validId(value.slice(prefix.length)),
    'invalid accepted quest cursor');
}

/** Trusted internal entry, not a disclosure DTO. Award source verification belongs to commands. */
export async function readAcceptedQuest(pages: WorldRead, ref: { key: string; id: string }): Promise<AcceptedQuest> {
  fields(ref, 'key id');
  check(validId(ref.id) && typeof ref.key === 'string' && ref.key.startsWith('quest/')
    && validId(ref.key.slice('quest/'.length)), 'invalid accepted quest reference');
  const record = await pages.get('world', ref.key);
  check(record, 'missing accepted quest');
  validateRecord(record, ref.id, record, 'world', `record/${ref.key}`);
  check(record.key === ref.key, 'accepted quest key changed');
  const quest = storedQuest(record.value), q = quest.quest;
  check(record.key === contentKey('quest', q.id) && same(record.indexes, questIndexes(quest)),
    'invalid accepted quest identity or indexes');
  const key = contentKey('contract', q.id), source = await pages.get('world', key);
  check(source, 'missing accepted quest contract');
  validateRecord(source, source.id, record, 'world', `record/${key}`);
  const { contract: c, accepted } = storedContract(source.value);
  check(source.key === key && c.id === q.id && same(source.indexes, [`contracts/${c.floor}/${c.id}`])
    && accepted, 'invalid accepted quest contract identity or acceptance');
  for (const field of ['id', 'floor', 'originRoomId', 'targetRoomId', 'targetRoomName', 'targetRoomKind', 'title', 'description'] as const)
    check(q[field] === c[field], 'quest contract identity changed');
  const { progress: _, ...task } = q.task;
  check(same(task, c.task) && q.reward.gold === c.rewardGold, 'quest differs from accepted contract');
  return { record, quest };
}

/** One bounded accepted-index page; no target index, geometry, chest or award-source reads. */
export async function listAcceptedQuests(pages: WorldRead, level: number, status: QuestStatus,
  after?: string, count = 4): Promise<{ rows: AcceptedQuest[]; next?: string }> {
  levelKey(level);
  check(['active', 'complete', 'claimed'].includes(status), 'invalid accepted quest status');
  check(integer(count, 1) && count <= 4, 'invalid accepted quest page size');
  const prefix = `quests/floor/${level}/${status}/`;
  if (after !== undefined) cursor(after, prefix);
  const page = await pages.scan('world', prefix, after, count), rows: AcceptedQuest[] = [];
  check(Array.isArray(page.rows) && page.rows.length <= count, 'oversized accepted quest page');
  let previous = after;
  for (const candidate of page.rows) {
    const entry = await readAcceptedQuest(pages, { key: candidate.key, id: candidate.id }), q = entry.quest.quest;
    check(same(candidate, entry.record), 'accepted quest index record changed');
    check(q.floor === level && q.status === status, 'invalid accepted quest floor or status');
    const index = `${prefix}${q.id}`;
    check(previous === undefined || index > previous, 'unordered accepted quest page');
    previous = index; rows.push(entry);
  }
  if (page.next !== undefined) {
    cursor(page.next, prefix);
    check(rows.length === count && page.next === previous, 'invalid accepted quest continuation');
  }
  return { rows, ...(page.next === undefined ? {} : { next: page.next }) };
}

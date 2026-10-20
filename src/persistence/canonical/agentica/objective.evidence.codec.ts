import type { CarriedQuestEvidence } from '../content/carriedQuest';
import type { CellSource } from '../knowledge/types';
import { cellSource } from '../knowledge/validation';
import { fields, id } from '../roster/codec';
import { rosterKey } from '../roster/records';
import type { GameIdentity } from '../types';
import { check, identity, jsonBytes, recordKey } from '../validation';

export interface ReturnEvidence extends GameIdentity {
  schema: 1;
  quest: CarriedQuestEvidence;
  arrival: CellSource | null;
}
function ref(input: unknown, key?: string) {
  const row = fields(input, 'key id'); recordKey(row.key as string); id(row.id);
  check(key === undefined || row.key === key, 'return evidence source key changed');
  return { key: row.key as string, id: row.id };
}

/** Strict private projection, not verification of its referenced records or original chest award. */
export function returnEvidence(input: unknown): ReturnEvidence {
  jsonBytes(input, 2048);
  const row = fields(input, 'schema generation gameId quest arrival');
  check(row.schema === 1, 'unsupported return evidence'); identity(row as unknown as GameIdentity);
  const q = fields(row.quest, 'generation gameId quest floor status containers items packCount stashCount');
  identity(q as unknown as GameIdentity, row as unknown as GameIdentity);
  const quest = ref(q.quest); check(quest.key.startsWith('quest/'), 'invalid return evidence quest');
  const questId = quest.key.slice('quest/'.length); id(questId);
  check(q.floor === 1 && ['active', 'complete', 'claimed'].includes(q.status as string), 'invalid return evidence quest state');
  const containers = fields(q.containers, 'pack stash');
  ref(containers.pack, rosterKey('pack')); ref(containers.stash, rosterKey('stash'));
  check(Array.isArray(q.items) && q.items.length <= 1, 'unbounded return evidence items');
  let packCount = 0, stashCount = 0;
  for (const input of q.items) {
    const item = fields(input, 'source owner count');
    ref(item.source, rosterKey('item', `quest-item:${questId}`));
    check(item.count === 1 && (item.owner === 'pack' || item.owner === 'stash'), 'invalid return evidence ownership');
    if (item.owner === 'pack') packCount++; else stashCount++;
  }
  check(q.packCount === packCount && q.stashCount === stashCount, 'return evidence counts disagree');
  if (row.arrival !== null) cellSource(row.arrival);
  return structuredClone(input) as ReturnEvidence;
}

/** Structural satisfaction only; the caller must retain and verify the source evidence. */
export function returnSatisfied(input: ReturnEvidence): boolean {
  const evidence = returnEvidence(input);
  return evidence.quest.packCount === 1 && ['complete', 'claimed'].includes(evidence.quest.status) && evidence.arrival !== null;
}

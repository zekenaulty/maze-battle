import { itemQuantity } from '../../../domain/items/itemQuantity';
import { matchesQuestItem } from '../../../domain/quests/questItems';
import type { QuestStatus } from '../../../domain/types';
import { containerHeader, itemIndexes, rosterKey, storedItem } from '../roster/records';
import type { CanonicalRecord, GameIdentity } from '../types';
import { check, record as validateRecord } from '../validation';
import { same } from '../world/records';
import type { WorldRead } from '../world/types';
import { readAcceptedQuest } from './acceptedQueries';

type SourceRef = Readonly<Pick<CanonicalRecord, 'key' | 'id'>>;
export interface CarriedQuestEvidence extends GameIdentity {
  quest: SourceRef;
  floor: number;
  status: QuestStatus;
  containers: { pack: SourceRef; stash: SourceRef };
  items: { source: SourceRef; owner: 'pack' | 'stash'; count: 1 }[];
  packCount: number;
  stashCount: number;
}
const source = ({ key, id }: CanonicalRecord): SourceRef => ({ key, id });

/**
 * Private evidence at the caller's pinned world snapshot, not return/completion proof.
 * Five point reads and at most two one-candidate scans; incomplete reads throw.
 * This lane supports only the single canonical collectible, not arbitrary matching stacks.
 */
export async function readCarriedQuest(pages: WorldRead, ref: SourceRef): Promise<CarriedQuestEvidence> {
  const accepted = await readAcceptedQuest(pages, { ...ref }), q = accepted.quest.quest;
  check(q.task.objective === 'fetch' && q.task.item && q.task.required === 1, 'carried quest requires a single-item fetch');
  async function container(group: 'pack' | 'stash') {
    const key = rosterKey(group), record = await pages.get('world', key);
    check(record, 'missing carried quest container');
    validateRecord(record, record.id, accepted.record, 'world', `record/${key}`);
    check(record.key === key && record.indexes.length === 0, 'invalid carried quest container identity');
    return { record, header: containerHeader(record.value, group) };
  }
  const pack = await container('pack'), stash = await container('stash');
  const itemId = `quest-item:${q.id}`, key = rosterKey('item', itemId), prefix = `roster/quest-items/${q.id}/`;
  const page = await pages.scan('world', prefix, undefined, 1);
  check(Array.isArray(page.rows) && page.rows.length <= 1 && page.next === undefined, 'incomplete or excessive carried quest candidates');
  // Independently check the canonical award identity so an omitted quest index cannot invent zero.
  const record = await pages.get('world', key), items: CarriedQuestEvidence['items'] = [];
  check((record !== undefined) === (page.rows.length === 1), 'incomplete carried quest item index');
  if (record !== undefined) {
    validateRecord(record, record.id, accepted.record, 'world', `record/${key}`);
    const candidate = page.rows[0];
    validateRecord(candidate, record.id, accepted.record, 'world', `index/${prefix}${itemId}`);
    check(record.key === key && same(candidate, record), 'carried quest index record changed');
    const row = storedItem(record.value);
    check(row.item.id === itemId && same(record.indexes, itemIndexes(row))
      && matchesQuestItem(row.item, q) && itemQuantity(row.item) === 1, 'invalid carried quest collectible');
    check(accepted.quest.award?.itemId === itemId, 'carried quest item lacks award provenance');
    check(row.owner.kind === 'pack' || row.owner.kind === 'stash', 'invalid carried quest ownership');
    const header = row.owner.kind === 'pack' ? pack.header : stash.header;
    check(header.count > 0 && row.order < header.nextOrder, 'carried quest ownership contradicts container');
    const ownership = await pages.scan('world', record.indexes[0], undefined, 1);
    check(Array.isArray(ownership.rows) && ownership.rows.length === 1 && ownership.next === undefined,
      'incomplete or ambiguous carried quest ownership index');
    validateRecord(ownership.rows[0], record.id, accepted.record, 'world', `index/${record.indexes[0]}`);
    check(same(ownership.rows[0], record), 'carried quest ownership index changed');
    items.push({ source: source(record), owner: row.owner.kind, count: 1 });
  }
  return { generation: accepted.record.generation, gameId: accepted.record.gameId, quest: source(accepted.record),
    floor: q.floor, status: q.status, containers: { pack: source(pack.record), stash: source(stash.record) }, items,
    packCount: items.filter(item => item.owner === 'pack').length, stashCount: items.filter(item => item.owner === 'stash').length };
}

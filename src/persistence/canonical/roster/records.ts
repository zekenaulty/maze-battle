import type { InventoryPolicy } from '../../../domain/types';
import type { CanonicalRecord } from '../types';
import { check, integer, jsonBytes } from '../validation';
import { fields, id, natural } from './codec';
import { validateItem } from './itemValidation';
import { groupOf, MAX_CONTAINER_RECORDS, MAX_PARTY_MEMBERS, type ContainerHeader, type PartyHeader, type PolicyRecord, type RosterRead, type StoredItem } from './types';
import { EQUIPMENT_SLOTS } from '../../../domain/items/equipment';

export const rosterKey = (kind: string, identity?: string) => {
  if (identity !== undefined) id(identity);
  return `roster/${kind}${identity === undefined ? '' : `/${identity}`}`;
};
export const itemIndexes = (row: StoredItem) => [
  `roster/items/${groupOf(row.owner)}/${String(row.order).padStart(16, '0')}/${row.item.id}`,
  ...(row.owner.kind === 'equipped' ? [`roster/equipped/${row.owner.actorId}/${row.owner.slot}`] : []),
  ...(row.item.questId ? [`roster/quest-items/${row.item.questId}/${row.item.id}`] : []),
];

export async function required(pages: RosterRead, kind: string, identity?: string) {
  const key = rosterKey(kind, identity), row = await pages.get('world', key);
  check(row, `missing established roster record: ${key}`); return row.value;
}

export function partyHeader(value: unknown): PartyHeader {
  const party = fields(value, 'schema actorIds');
  check(party.schema === 1 && Array.isArray(party.actorIds) && party.actorIds.length > 0
    && party.actorIds.length <= MAX_PARTY_MEMBERS && new Set(party.actorIds).size === party.actorIds.length, 'invalid party membership');
  party.actorIds.forEach(id); return value as PartyHeader;
}
export function containerHeader(value: unknown, group: 'pack' | 'stash'): ContainerHeader {
  const container = fields(value, `schema capacity count nextOrder${group === 'pack' ? ' gold' : ''}`);
  check(container.schema === 1 && integer(container.capacity, 1) && container.capacity <= MAX_CONTAINER_RECORDS
    && integer(container.count) && container.count <= MAX_CONTAINER_RECORDS
    && integer(container.nextOrder, 1), 'invalid bounded item container');
  if (group === 'pack') natural(container.gold);
  return value as ContainerHeader;
}
export function policyRecord(value: unknown): PolicyRecord {
  const row = fields(value, 'schema policy'); check(row.schema === 1, 'invalid inventory policy schema');
  validatePolicy(row.policy); return value as PolicyRecord;
}
export function validatePolicy(value: unknown): asserts value is InventoryPolicy {
  const p = fields(value, 'autoEquip autoSellJunk autoStash autoRestock healthReserve manaReserve portalReserve');
  for (const key of ['autoEquip', 'autoSellJunk', 'autoStash', 'autoRestock']) check(typeof p[key] === 'boolean', 'invalid inventory policy flag');
  check(integer(p.healthReserve) && p.healthReserve <= 20 && integer(p.manaReserve) && p.manaReserve <= 20
    && integer(p.portalReserve, 1) && p.portalReserve <= 5, 'invalid inventory reserves');
}
export function storedItem(value: unknown): StoredItem {
  const row = fields(value, 'schema item owner order');
  check(row.schema === 1, 'invalid stored item schema'); natural(row.order, 1); validateItem(row.item);
  const owner = fields(row.owner, 'kind', 'actorId slot');
  check(typeof owner.kind === 'string' && ['pack', 'stash', 'equipped'].includes(owner.kind), 'invalid item owner');
  if (owner.kind === 'equipped') {
    id(owner.actorId); check(EQUIPMENT_SLOTS.includes(owner.slot as never) && row.item.category === 'equipment'
      && row.item.slot === owner.slot, 'invalid equipped item ownership');
  } else check(Object.keys(owner).length === 1, 'container item has actor ownership');
  jsonBytes(value, 10 * 1024); return value as StoredItem;
}

export async function containerItems(pages: RosterRead, group: 'pack' | 'stash', header: ContainerHeader) {
  const prefix = `roster/items/${group}/`, items: StoredItem[] = [];
  let after: string | undefined;
  do {
    const page = await pages.scan('world', prefix, after, 32);
    for (const record of page.rows) {
      const row = checkedItemRecord(record);
      check(groupOf(row.owner) === group && row.order < header.nextOrder && (items.at(-1)?.order ?? 0) < row.order, 'invalid container item order');
      items.push(row); check(items.length <= header.count, 'item count exceeds container header');
    }
    after = page.next;
    check(after === undefined || page.rows.length > 0 && items.length < header.count, 'invalid item continuation');
  } while (after !== undefined);
  check(items.length === header.count, 'missing container items'); return items;
}
function checkedItemRecord(record: CanonicalRecord) {
  const row = storedItem(record.value);
  check(record.key === rosterKey('item', row.item.id) && JSON.stringify(record.indexes) === JSON.stringify(itemIndexes(row)), 'invalid item index ownership');
  return row;
}

import type { RosterState } from '../../../domain/party/roster';
import type { CanonicalPages } from '../pages';
import { check, integer } from '../validation';
import { same } from '../world/records';
import { encodeActor } from './actorValidation';
import { encodeItem } from './itemValidation';
import { encodeRoster } from './codec';
import { equipmentOwners } from './projection';
import { containerHeader, itemIndexes, partyHeader, policyRecord, rosterKey, storedItem } from './records';
import { groupOf, MAX_CONTAINER_RECORDS, type ContainerHeader, type RosterSnapshot, type StoredActor, type StoredItem } from './types';

type Rows = RosterSnapshot['rows'];

function projectRows(state: RosterState, prior?: Rows): Rows {
  const party = partyHeader(encodeRoster({ schema: 1, actorIds: state.party.map(actor => actor.id) }));
  const actors = new Map<string, StoredActor>();
  for (const value of state.party) {
    const actor = encodeActor(value); actors.set(actor.id, { schema: 1, actor });
  }
  const policy = policyRecord(encodeRoster({ schema: 1, policy: state.inventoryPolicy }));
  const owners = equipmentOwners(state), items = new Map<string, StoredItem>();
  function container(group: 'pack' | 'stash'): ContainerHeader {
    const source = group === 'pack' ? state.inventory : state.stash;
    check(Array.isArray(source.items) && source.items.length <= MAX_CONTAINER_RECORDS, 'invalid bounded item container');
    let nextOrder = prior?.[group].nextOrder ?? 1, previousOrder = 0;
    for (const item of source.items) {
      const before = prior?.items.get(item.id);
      const order = before && groupOf(before.owner) === group ? before.order : nextOrder++;
      check(order > previousOrder && integer(nextOrder, 1), 'item order changed or exhausted'); previousOrder = order;
      const owner = group === 'stash' ? { kind: 'stash' as const } : owners.get(item.id) ?? { kind: 'pack' as const };
      items.set(item.id, storedItem({ schema: 1, item: encodeItem(item), owner, order }));
    }
    return containerHeader({ schema: 1, capacity: source.capacity, count: source.items.length, nextOrder,
      ...(group === 'pack' ? { gold: state.inventory.gold } : {}) }, group);
  }
  const pack = container('pack'), stash = container('stash');
  return { party, actors, policy, pack, stash, items };
}

/** Initialization of new domain state only. Does not read or import a prior save. */
export async function seedRoster(pages: CanonicalPages, state: RosterState) {
  const next = projectRows(state);
  for (const key of ['party', 'pack', 'stash', 'policy']) check(!await pages.get('world', rosterKey(key)), 'roster already initialized');
  await writeRows(pages, next);
}

/** Atomic delta of independently owned records. No unchanged actor/item is rewritten. */
export async function saveRoster(pages: CanonicalPages, before: RosterSnapshot, state: RosterState) {
  const next = projectRows(state, before.rows);
  check(same(before.rows.party, next.party), 'party membership requires a dedicated command');
  await writeRows(pages, next, before.rows);
}

async function writeRows(pages: CanonicalPages, next: Rows, before?: Rows) {
  for (const key of ['party', 'pack', 'stash', 'policy'] as const)
    if (!before || !same(before[key], next[key])) await pages.set('world', rosterKey(key), encodeRoster(next[key]));
  for (const [id, row] of next.actors) {
    if (before && same(before.actors.get(id), row)) continue;
    if (!before) check(!await pages.get('world', rosterKey('actor', id)), 'actor identity already exists');
    await pages.set('world', rosterKey('actor', id), encodeRoster(row));
  }
  // Release all moved ownership indexes before assigning replacements or swaps.
  for (const [id, previous] of before?.items ?? []) {
    const row = next.items.get(id);
    if (!row || !same(itemIndexes(previous), itemIndexes(row))) await pages.delete('world', rosterKey('item', id));
  }
  for (const [id, row] of next.items) {
    const previous = before?.items.get(id);
    if (previous && same(previous, row)) continue;
    if (!previous) check(!await pages.get('world', rosterKey('item', id)), 'item identity already exists');
    await pages.set('world', rosterKey('item', id), encodeRoster(row), itemIndexes(row));
  }
}

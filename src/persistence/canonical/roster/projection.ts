import type { RosterState } from '../../../domain/party/roster';
import type { ActorState, EquipmentSlot } from '../../../domain/types';
import { check } from '../validation';
import { validateActor } from './actorValidation';
import { fields } from './codec';
import { containerHeader, containerItems, partyHeader, policyRecord, required } from './records';
import type { ItemOwner, RosterContext, RosterRead, RosterSnapshot, StoredActor } from './types';

/** This is an action/UI projection, not a serialized GameState or a movement dependency. */
export async function loadRoster(pages: RosterRead, context: RosterContext): Promise<RosterSnapshot> {
  const party = partyHeader(await required(pages, 'party')), actors = new Map<string, StoredActor>();
  for (const actorId of party.actorIds) {
    const value = await required(pages, 'actor', actorId), row = fields(value, 'schema actor');
    check(row.schema === 1, 'invalid actor schema'); validateActor(row.actor);
    check(row.actor.id === actorId, 'party identity mismatch'); actors.set(actorId, value as unknown as StoredActor);
  }
  const pack = containerHeader(await required(pages, 'pack'), 'pack'), stash = containerHeader(await required(pages, 'stash'), 'stash');
  const policy = policyRecord(await required(pages, 'policy'));
  const carried = await containerItems(pages, 'pack', pack), stored = await containerItems(pages, 'stash', stash);
  const items = new Map([...carried, ...stored].map(row => [row.item.id, row]));
  check(items.size === carried.length + stored.length, 'duplicate item identity');
  const state: RosterState = { ...context, party: party.actorIds.map(id => actors.get(id)!.actor), inventoryPolicy: policy.policy,
    inventory: { capacity: pack.capacity, gold: pack.gold!, items: carried.map(row => row.item) },
    stash: { capacity: stash.capacity, items: stored.map(row => row.item) } };
  const owners = equipmentOwners(state);
  for (const row of items.values()) {
    const owner = owners.get(row.item.id);
    check(row.owner.kind === 'equipped' ? owner?.actorId === row.owner.actorId && owner.slot === row.owner.slot : !owner, 'equipment and ownership disagree');
  }
  return { state: structuredClone(state), rows: { party, pack, stash, policy, actors, items } };
}

export function equipmentOwners(state: Pick<RosterState, 'party' | 'inventory' | 'stash'>) {
  const owners = new Map<string, Extract<ItemOwner, { kind: 'equipped' }>>();
  const carried = new Map(state.inventory.items.map(item => [item.id, item]));
  check(carried.size === state.inventory.items.length, 'duplicate carried item');
  const all = [...state.inventory.items, ...state.stash.items];
  check(new Set(all.map(item => item.id)).size === all.length, 'duplicate owned item');
  for (const actor of state.party) for (const [slot, itemId] of Object.entries(actor.equipment)) {
    const item = carried.get(itemId);
    check(item && item.category === 'equipment' && item.slot === slot && !owners.has(itemId), 'invalid equipment reference');
    owners.set(itemId, { kind: 'equipped', actorId: actor.id, slot: slot as EquipmentSlot });
  }
  return owners;
}

/** Party resources can be read without hydrating any item or dungeon record. */
export async function loadParty(pages: RosterRead): Promise<ActorState[]> {
  const party = partyHeader(await required(pages, 'party')), result: ActorState[] = [];
  for (const actorId of party.actorIds) {
    const row = fields(await required(pages, 'actor', actorId), 'schema actor');
    check(row.schema === 1, 'invalid actor schema'); validateActor(row.actor);
    check(row.actor.id === actorId, 'party identity mismatch'); result.push(row.actor);
  }
  return result;
}

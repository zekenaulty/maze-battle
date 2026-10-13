import type { EquipmentSlot } from '../domain/types';
import { canApplyPackChange, packSlotUsage, type PackCapacityState } from '../domain/items/packCapacity';
import { ambiguousEquipmentIds, ambiguousItemIds } from '../domain/items/itemOwnership';
import { isEquipmentItem, omitSlot, removeItemFromEquipment } from '../domain/items/equipment';
import { itemQuantity, mergeInventoryItems } from '../domain/items/itemStacks';
import { getEquippedItemOwner } from './inventoryComparison';

type InventoryContext = Pick<PackCapacityState, 'inventory' | 'party'> & Partial<Pick<PackCapacityState, 'stash'>>;

function capacityState(context: InventoryContext): PackCapacityState {
  return { ...context, stash: context.stash ?? { capacity: 0, items: [] } };
}

export function inventoryPackUsage(context: InventoryContext) {
  return packSlotUsage(capacityState(context));
}

export function equipDisabledReason(context: InventoryContext, actorId: string, itemId: string) {
  const game = capacityState(context);
  const actors = game.party.filter((actor) => actor.id === actorId);
  if (actors.length !== 1) return 'Character identity unavailable';
  const actor = actors[0];
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item?.slot || !itemId || !isEquipmentItem(item) || itemQuantity(item) !== 1) return 'Invalid equipment';
  if (ambiguousEquipmentIds(game).has(itemId)) return 'Duplicate item identity';
  if (actor.equipment[item.slot] === itemId) return 'Already equipped';
  const slot = item.slot;
  const party = game.party.map((candidate) => {
    const equipment = removeItemFromEquipment(candidate.equipment, itemId);
    return { ...candidate, equipment: candidate.id === actorId ? { ...equipment, [slot]: itemId } : equipment };
  });
  return canApplyPackChange(game, { ...game, party }) ? undefined : 'Pack full: no room for displaced gear';
}

export function unequipDisabledReason(context: InventoryContext, actorId: string, slot: EquipmentSlot) {
  const game = capacityState(context);
  const actors = game.party.filter((actor) => actor.id === actorId);
  if (actors.length !== 1) return 'Character identity unavailable';
  if (!actors[0].equipment[slot]) return 'Nothing equipped';
  const party = game.party.map((actor) => actor.id === actorId ? { ...actor, equipment: omitSlot(actor.equipment, slot) } : actor);
  return canApplyPackChange(game, { ...game, party }) ? undefined : 'Pack full: no room to unequip';
}

export function stashDisabledReason(context: InventoryContext, itemId: string) {
  const game = capacityState(context);
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item || itemQuantity(item) === 0) return 'Invalid stack quantity';
  const ambiguous = ambiguousItemIds(game);
  if (ambiguous.has(itemId)) return 'Duplicate item identity';
  if (getEquippedItemOwner(itemId, game.party)) return 'Unequip before stashing';
  if (item.locked) return 'Unlock before stashing';
  if (context.stash && mergeInventoryItems(context.stash, [item], false, ambiguous).accepted.length === 0) return 'Stash full';
  return undefined;
}

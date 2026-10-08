import type { ActorState, EquipmentSlot, InventoryState, ItemInstance } from '../domain/types';
import { getEffectiveActor } from '../domain/items/inventory';
import { getItemGearScore } from '../domain/items/gearScore';
import { actorStat, CHARACTER_STATS } from './characterSheet';

export function getEquippedItemOwner(itemId: string, party: ActorState[]) {
  for (const actor of party) {
    const slot = Object.entries(actor.equipment).find(([, id]) => id === itemId)?.[0] as EquipmentSlot | undefined;
    if (slot) return { actor, slot };
  }
  return undefined;
}

export function compareItem(item: ItemInstance, actor: ActorState, inventory: InventoryState) {
  const slot = item.slot;
  if (!slot) return undefined;
  const current = inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);
  const before = getEffectiveActor(actor, inventory);
  const after = getEffectiveActor({ ...actor, equipment: { ...actor.equipment, [slot]: item.id } }, inventory);
  return {
    actorName: actor.displayName,
    slot,
    currentName: current?.displayName ?? `empty ${slot}`,
    isCurrent: current?.id === item.id,
    score: getItemGearScore(item, actor),
    scoreDelta: getItemGearScore(item, actor) - (current ? getItemGearScore(current, actor) : 0),
    deltas: CHARACTER_STATS.map(({ key, label }) => ({ key, label, value: actorStat(after, key) - actorStat(before, key) })).filter(({ value }) => value !== 0),
  };
}

export type ItemComparison = NonNullable<ReturnType<typeof compareItem>>;

export function consumableDisabledReason(item: ItemInstance, actor: ActorState, canUseTownPortal = true) {
  if ((item.quantity ?? 1) <= 0) return 'Empty stack';
  if (item.consumableEffect === 'townPortal') return canUseTownPortal ? undefined : 'Portal unavailable here';
  if (!item.consumableEffect) return 'Not consumable';
  if ((item.consumableAmount ?? 0) <= 0) return 'No restorative effect';
  // useConsumable currently caps at base maxima, unlike battle healing.
  if (item.consumableEffect === 'heal' && actor.hp >= actor.maxHp) return 'HP at potion cap';
  if (item.consumableEffect === 'mana' && actor.mp >= actor.maxMp) return 'MP at potion cap';
  return undefined;
}

import type { ActorState, EquipmentSlot, InventoryState, ItemInstance } from '../domain/types';
import { evaluateGearUpgrade, getEffectiveActor } from '../domain/items/inventory';
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
    evaluation: evaluateGearUpgrade(actor, item, inventory.items),
    score: getItemGearScore(item, actor),
    scoreDelta: getItemGearScore(item, actor) - (current ? getItemGearScore(current, actor) : 0),
    deltas: CHARACTER_STATS.map(({ key, label }) => ({ key, label, value: actorStat(after, key) - actorStat(before, key) })).filter(({ value }) => value !== 0),
  };
}

export type ItemComparison = NonNullable<ReturnType<typeof compareItem>>;

export function consumableDisabledReason(item: ItemInstance, effectiveActor: ActorState, canUseTownPortal = true) {
  if (!item.consumableEffect || item.slot) return 'Not a usable consumable';
  if (item.locked) return 'Unlock before use';
  const quantity = item.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity < 1) return 'Empty stack';
  if (item.consumableEffect === 'townPortal') return canUseTownPortal && item.category === 'consumable' ? undefined : 'Portal unavailable here';
  if (effectiveActor.hp <= 0) return 'Cannot use on a fallen character';
  const amount = item.consumableAmount ?? 0;
  if (!Number.isFinite(amount) || amount <= 0) return 'No restorative effect';
  if (item.consumableEffect === 'heal' && effectiveActor.hp >= effectiveActor.maxHp) return 'HP already full';
  if (item.consumableEffect === 'mana' && effectiveActor.mp >= effectiveActor.maxMp) return 'MP already full';
  return undefined;
}

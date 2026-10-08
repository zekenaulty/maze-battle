import type { ActorState, EquipmentSlot, GameState, InventoryState, ItemStats } from '../types';
import { addItemStats, getItemTotalStats } from './itemDetails';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];

export function getEquippedItems(actor: ActorState, inventory: InventoryState) {
  const ids = Object.values(actor.equipment);
  return inventory.items.filter((item) => ids.includes(item.id));
}

export function getEffectiveActor(actor: ActorState, inventory: InventoryState): ActorState {
  const bonus = getEquipmentStats(actor, inventory);
  const maxHp = actor.maxHp + (bonus.maxHp ?? 0) + (bonus.vitality ?? 0) * 2;
  const maxMp = actor.maxMp + (bonus.maxMp ?? 0) + (bonus.intellect ?? 0) * 2;
  return {
    ...actor,
    hp: Math.min(actor.hp, maxHp),
    mp: Math.min(actor.mp, maxMp),
    maxHp,
    maxMp,
    attributes: {
      ...actor.attributes,
      strength: actor.attributes.strength + (bonus.strength ?? 0),
      vitality: actor.attributes.vitality + (bonus.vitality ?? 0),
      intellect: actor.attributes.intellect + (bonus.intellect ?? 0),
    },
    combat: { ...actor.combat, baseDamage: actor.combat.baseDamage + (bonus.baseDamage ?? 0) },
  };
}

export function getEquipmentStats(actor: ActorState, inventory: InventoryState): ItemStats {
  return getEquippedItems(actor, inventory).reduce<ItemStats>((stats, item) => addItemStats(stats, getItemTotalStats(item)), {});
}

export function isItemEquipped(game: GameState, itemId: string) {
  return game.party.some((actor) => Object.values(actor.equipment).includes(itemId));
}

export function clampActorVitals(actor: ActorState, inventory: InventoryState): ActorState {
  const effective = getEffectiveActor(actor, inventory);
  return { ...actor, hp: Math.min(actor.hp, effective.maxHp), mp: Math.min(actor.mp, effective.maxMp) };
}

export function removeItemFromEquipment(equipment: ActorState['equipment'], itemId: string) {
  if (!Object.values(equipment).includes(itemId)) return equipment;
  return Object.fromEntries(Object.entries(equipment).filter(([, id]) => id !== itemId));
}

export function omitSlot(equipment: ActorState['equipment'], slot: EquipmentSlot) {
  const { [slot]: _removed, ...next } = equipment;
  return next;
}

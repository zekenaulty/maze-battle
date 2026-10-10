import type { ActorState, HeroRole, ItemInstance, ItemStats } from '../types';
import { getItemTotalStats } from './itemDetails';
import { isEquipmentItem } from './equipment';

const ROLE_WEIGHTS: Record<HeroRole, Required<ItemStats>> = {
  warrior: {
    baseDamage: 7,
    strength: 3,
    vitality: 1.4,
    intellect: 0.15,
    maxHp: 0.25,
    maxMp: 0.03,
  },
  mage: {
    baseDamage: 4,
    strength: 0.2,
    vitality: 1,
    intellect: 3.2,
    maxHp: 0.22,
    maxMp: 0.35,
  },
  healer: {
    baseDamage: 2.5,
    strength: 0.15,
    vitality: 1.4,
    intellect: 3,
    maxHp: 0.25,
    maxMp: 0.42,
  },
};

/** Legacy display score only. Automation uses gearEvaluation's complete-loadout policy. */
export function getItemGearScore(item: ItemInstance, actor: ActorState) {
  if (!isEquipmentItem(item)) {
    return 0;
  }

  const stats = getItemTotalStats(item);
  const weights = ROLE_WEIGHTS[actor.role];
  const raw =
    (stats.baseDamage ?? 0) * weights.baseDamage +
    (stats.strength ?? 0) * weights.strength +
    (stats.vitality ?? 0) * weights.vitality +
    (stats.intellect ?? 0) * weights.intellect +
    (stats.maxHp ?? 0) * weights.maxHp +
    (stats.maxMp ?? 0) * weights.maxMp;

  return Math.max(0, Math.round(raw * 10));
}

export function getActorGearScore(actor: ActorState, inventoryItems: ItemInstance[]) {
  return Object.values(actor.equipment).reduce((total, itemId) => {
    const item = inventoryItems.find((candidate) => candidate.id === itemId);
    return item ? total + getItemGearScore(item, actor) : total;
  }, 0);
}

/** All current equipment is usable by every role; itemLevel is not a level requirement. */
export function getGearUpgradeScore(item: ItemInstance, actor: ActorState, inventoryItems: ItemInstance[]): number {
  if (!item.slot) return 0;
  const equipped = inventoryItems.find((candidate) => candidate.id === actor.equipment[item.slot!] && candidate.slot === item.slot);
  return getItemGearScore(item, actor) - (equipped ? getItemGearScore(equipped, actor) : 0);
}

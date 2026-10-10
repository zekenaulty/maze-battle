import type { ActorState, EquipmentSlot, InventoryState } from '../domain/types';
import { damageRange } from '../domain/combat/stats';
import { xpForNextLevel } from '../domain/combat/rewards';
import { getEffectiveActor } from '../domain/items/inventory';
import { getActorGearScore } from '../domain/items/gearScore';

export type SpendableAttribute = 'strength' | 'vitality' | 'intellect';
export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];

export const CHARACTER_STATS = [
  { key: 'strength', label: 'Strength' },
  { key: 'vitality', label: 'Vitality' },
  { key: 'intellect', label: 'Intellect' },
  { key: 'maxHp', label: 'Max HP' },
  { key: 'maxMp', label: 'Max MP' },
  { key: 'baseDamage', label: 'Base damage' },
] as const;

export type CharacterStat = typeof CHARACTER_STATS[number]['key'];

export function actorStat(actor: ActorState, key: CharacterStat) {
  if (key === 'baseDamage') return actor.combat.baseDamage;
  if (key === 'maxHp' || key === 'maxMp') return actor[key];
  return actor.attributes[key];
}

export function projectCharacter(actor: ActorState, inventory: InventoryState) {
  const effective = getEffectiveActor(actor, inventory);
  const xpRequired = xpForNextLevel(actor.level);
  return {
    effective,
    gearScore: getActorGearScore(actor, inventory.items),
    xpRequired,
    xpRemaining: Math.max(0, xpRequired - actor.xp),
    xpPercent: Math.max(0, Math.min(100, actor.xp / xpRequired * 100)),
    baseDamage: damageRange(actor, 'attack'),
    effectiveDamage: damageRange(effective, 'attack'),
    stats: CHARACTER_STATS.map(({ key, label }) => ({
      key, label,
      base: actorStat(actor, key),
      gear: actorStat(effective, key) - actorStat(actor, key),
      effective: actorStat(effective, key),
    })),
  };
}

export function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

import { damageRange } from '../combat/stats';
import { SKILLS } from '../combat/skillCatalog';
import type { ActorState, ItemInstance } from '../types';
import { getEffectiveActor } from './equipment';

export interface GearMetrics {
  offense: number;
  hp: number;
  mana: number;
}

/** Expected damage per learned offensive action, not DPS or assumed area target count. */
export function getLoadoutMetrics(actor: ActorState, items: ItemInstance[]): GearMetrics {
  const effective = getEffectiveActor(actor, { items, capacity: items.length, gold: 0 });
  const learned = [...new Set(actor.skills.map((skill) => skill.id))].map((id) => SKILLS[id]).filter(Boolean);
  const offensive = learned.filter((skill) => skill.target === 'enemy' || skill.target === 'allEnemies');
  const damage = offensive.map((skill) => {
    const { min, max } = damageRange(effective, skill.id);
    // rollDamage clamps a uniform integer [1, max] to min, rather than rolling [min, max].
    return min >= max ? min : (max * (max + 1) + min * (min - 1)) / (2 * max);
  });
  return {
    offense: damage.length ? damage.reduce((sum, value) => sum + value, 0) / damage.length : 0,
    hp: effective.maxHp,
    mana: learned.some((skill) => skill.mpCost > 0) ? effective.maxMp : 0,
  };
}

import type { Combatant } from './combatant';
import type { SkillId } from '../types';
import { roll, type Rng } from './rng';

export interface DamageRange {
  min: number;
  max: number;
}

export function damageRange(actor: Combatant, skillId: SkillId): DamageRange {
  const scaledAttribute = actor.attributes[actor.combat.scaleWith];
  const baseMin = Math.floor(actor.combat.baseDamage / 6 + 1) + Math.floor(scaledAttribute / 6) + 1;
  const baseMax = actor.combat.baseDamage + Math.ceil(scaledAttribute / 3) + 3;
  const bonus = skillBonus(actor, skillId, { min: baseMin, max: baseMax });

  return {
    min: Math.max(1, baseMin + bonus.min),
    max: Math.max(1, baseMax + bonus.max),
  };
}

export function rollDamage(actor: Combatant, skillId: SkillId, rng: Rng) {
  const range = damageRange(actor, skillId);
  return Math.max(range.min, Math.min(range.max, roll(range.max, rng)));
}

function skillBonus(actor: Combatant, skillId: SkillId, base: DamageRange): DamageRange {
  switch (skillId) {
    case 'cleave':
    case 'magicMissiles':
      return { min: -Math.ceil(base.min * 0.2), max: -Math.ceil(base.max * 0.15) };
    case 'slam':
      return {
        min: Math.ceil(actor.attributes.strength * 0.15),
        max: Math.ceil(actor.attributes.strength * 0.35),
      };
    case 'arcaneBlast':
    case 'arcaneWave':
      return {
        min: Math.ceil(actor.attributes.intellect * 0.15),
        max: Math.ceil(actor.attributes.intellect * 0.35),
      };
    case 'smite':
    case 'wand':
      return { min: -2, max: -4 };
    default:
      return { min: 0, max: 0 };
  }
}

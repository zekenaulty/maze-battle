import type { ActorState, InventoryState, SkillId, SkillState } from '../domain/types';
import { getActorGcdRemaining, getAvailableCharges, getSkillCooldownRemaining } from '../domain/combat/combatant';
import { SKILLS } from '../domain/combat/skillCatalog';
import { damageRange } from '../domain/combat/stats';
import { getEffectiveActor } from '../domain/items/inventory';

export function skillEffect(actor: ActorState, id: SkillId) {
  const definition = SKILLS[id];
  if (definition.target === 'enemy' || definition.target === 'allEnemies') {
    const range = damageRange(actor, id);
    const target = definition.target === 'allEnemies' ? 'each living enemy' : 'one enemy';
    return `${range.min}-${range.max} damage to ${target}.${id === 'wand' ? ' Restores 10 MP to the caster.' : ''}`;
  }

  // Non-damage effects mirror applySkill.ts; the catalog only owns cost/timing/target.
  switch (id) {
    case 'heal': return 'Restores 35% of effective max HP to the living ally with the lowest HP ratio (rounded up).';
    case 'groupHeal': return 'Restores 25% of effective max HP to each living ally (rounded up).';
    case 'resurrect': return 'Revives the first fallen ally with 50% of effective max HP (rounded up).';
    case 'teleport': return 'No travel effect implemented.';
    default: return 'No effect defined.';
  }
}

export function projectSkill(actor: ActorState, inventory: InventoryState, skill: SkillState, now: number) {
  const definition = SKILLS[skill.id];
  if (!definition) return undefined;
  const effective = getEffectiveActor(actor, inventory);
  const charges = getAvailableCharges(skill, now);
  const cooldownMs = Math.max(getSkillCooldownRemaining(skill, now), getActorGcdRemaining(actor, now));
  const missingMana = Math.max(0, definition.mpCost - effective.mp);
  let rechargeMs = 0;
  if (charges !== undefined && charges < (skill.maxCharges ?? charges) && definition.rechargeMs && skill.rechargeUntil) {
    const elapsedCycles = now < skill.rechargeUntil ? 0 : 1 + Math.floor((now - skill.rechargeUntil) / definition.rechargeMs);
    rechargeMs = skill.rechargeUntil + elapsedCycles * definition.rechargeMs - now;
  }
  const status = skill.id === 'teleport' ? 'Unavailable'
    : actor.hp <= 0 ? 'Fallen'
    : cooldownMs > 0 ? `Cooldown ${seconds(cooldownMs)}s`
    : charges === 0 ? 'No charges'
    : missingMana > 0 ? `Needs ${missingMana} MP`
    : 'Ready';

  return { ...definition, effect: skillEffect(effective, skill.id), charges, maxCharges: skill.maxCharges ?? charges, rechargeRemainingMs: rechargeMs, status };
}

export function seconds(ms: number) {
  return Math.ceil(ms / 100) / 10;
}

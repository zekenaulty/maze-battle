import type { ActorState, EnemyState, ItemInstance, ItemStats, SkillId } from '../types';
import { beginSkillTimers, canUseSkill, damage, findSkill, isAlive, spendMana, type Combatant } from './combatant';
import { rollDamage } from './stats';
import { SKILLS } from './skillCatalog';
import { firstDeadAlly, pickEnemy, pickWeightedHero } from './targeting';
import type { Rng } from './rng';

export interface CombatContext {
  party: ActorState[];
  enemies: EnemyState[];
  log: string[];
  loot: ItemInstance[];
  equipmentBonuses: Record<string, ItemStats>;
  rng: Rng;
  now: number;
}

export function applySkill(actor: Combatant, skillId: SkillId, context: CombatContext) {
  if (!canUseSkill(actor, skillId, context.now)) {
    return false;
  }

  const definition = SKILLS[skillId];
  const skill = findSkill(actor, skillId);
  if (!skill || !spendMana(actor, definition.mpCost)) {
    return false;
  }

  beginSkillTimers(actor, skill, skillId, context.now);

  if (definition.target === 'enemy') {
    const target = 'token' in actor ? pickWeightedHero(context.party, context.rng) : pickEnemy(context.enemies, context.rng);
    hit(actor, target, skillId, context);
  } else if (definition.target === 'allEnemies') {
    for (const enemy of context.enemies.filter((target) => target.hp > 0)) {
      hit(actor, enemy, skillId, context);
    }
  } else if (skillId === 'heal') {
    const target = lowestHealthAlly(context);
    if (target) {
      healWithEquipment(target, effectiveMaxHp(target, context) * 0.35, context);
      context.log.push(`${actor.displayName} casts Heal on ${target.displayName}.`);
    }
  } else if (skillId === 'groupHeal') {
    for (const target of context.party.filter((ally) => ally.hp > 0)) {
      healWithEquipment(target, effectiveMaxHp(target, context) * 0.25, context);
    }
    context.log.push(`${actor.displayName} casts Group Heal.`);
  } else if (skillId === 'resurrect') {
    const target = firstDeadAlly(context.party);
    if (target) {
      healWithEquipment(target, effectiveMaxHp(target, context) * 0.5, context);
      context.log.push(`${actor.displayName} resurrects ${target.displayName}.`);
    }
  }

  if (skillId === 'wand') {
    restoreManaWithEquipment(actor, 10, context);
    context.log.push(`${actor.displayName} recovers mana with Wand.`);
  }

  return true;
}

function hit(actor: Combatant, target: Combatant | undefined, skillId: SkillId, context: CombatContext) {
  if (!target || target.hp < 1) {
    return;
  }

  const amount = rollDamage(effectiveCombatant(actor, context), skillId, context.rng);
  damage(target, amount);
  context.log.push(`${actor.displayName} uses ${SKILLS[skillId].name} on ${target.displayName} for ${amount}.`);
}

function effectiveCombatant(actor: Combatant, context: CombatContext): Combatant {
  if ('token' in actor) {
    return actor;
  }

  const bonus = context.equipmentBonuses[actor.id];
  if (!bonus) {
    return actor;
  }

  return {
    ...actor,
    maxHp: effectiveMaxHp(actor, context),
    maxMp: effectiveMaxMp(actor, context),
    attributes: {
      ...actor.attributes,
      strength: actor.attributes.strength + (bonus.strength ?? 0),
      vitality: actor.attributes.vitality + (bonus.vitality ?? 0),
      intellect: actor.attributes.intellect + (bonus.intellect ?? 0),
    },
    combat: {
      ...actor.combat,
      baseDamage: actor.combat.baseDamage + (bonus.baseDamage ?? 0),
    },
  };
}

function effectiveMaxHp(actor: ActorState, context: CombatContext) {
  const bonus = context.equipmentBonuses[actor.id];
  return actor.maxHp + (bonus?.maxHp ?? 0) + (bonus?.vitality ?? 0) * 2;
}

function effectiveMaxMp(actor: Combatant, context: CombatContext) {
  if ('token' in actor) {
    return actor.maxMp;
  }

  const bonus = context.equipmentBonuses[actor.id];
  return actor.maxMp + (bonus?.maxMp ?? 0) + (bonus?.intellect ?? 0) * 2;
}

function healWithEquipment(actor: ActorState, amount: number, context: CombatContext) {
  actor.hp = Math.min(effectiveMaxHp(actor, context), actor.hp + Math.ceil(amount));
}

function restoreManaWithEquipment(actor: Combatant, amount: number, context: CombatContext) {
  actor.mp = Math.min(effectiveMaxMp(actor, context), actor.mp + amount);
}

function lowestHealthAlly(context: CombatContext) {
  return context.party.filter(isAlive).sort((a, b) => a.hp / effectiveMaxHp(a, context) - b.hp / effectiveMaxHp(b, context))[0];
}

import type { ActorState, EnemyState, SkillId } from '../types';
import { canUseSkill, healthRatio, isAlive } from './combatant';
import { roll, type Rng } from './rng';
import { firstDeadAlly, lowestHealthAlly, partyIsLow } from './targeting';

export function chooseHeroSkill(actor: ActorState, party: ActorState[], enemies: EnemyState[], rng: Rng, now = Date.now()): SkillId | undefined {
  if (!actor.autoBattle || !isAlive(actor)) {
    return undefined;
  }

  if (actor.role === 'warrior') {
    return chooseWarriorSkill(actor, enemies, rng, now);
  }

  if (actor.role === 'mage') {
    return chooseMageSkill(actor, enemies, rng, now);
  }

  return chooseHealerSkill(actor, party, now);
}

export function chooseEnemySkill(enemy: EnemyState, rng: Rng, now = Date.now()): SkillId | undefined {
  if (!isAlive(enemy) || roll(20, rng) <= 3 || !canUseSkill(enemy, 'attack', now)) {
    return undefined;
  }

  return 'attack';
}

function chooseWarriorSkill(actor: ActorState, enemies: EnemyState[], rng: Rng, now: number): SkillId | undefined {
  const livingEnemies = enemies.filter(isAlive);

  if (livingEnemies.length > 2 && canUseSkill(actor, 'slam', now) && roll(6, rng) > 2) {
    return 'slam';
  }

  if (livingEnemies.length > 1 && canUseSkill(actor, 'cleave', now) && roll(6, rng) > 1) {
    return 'cleave';
  }

  return canUseSkill(actor, 'slash', now) ? 'slash' : undefined;
}

function chooseMageSkill(actor: ActorState, enemies: EnemyState[], rng: Rng, now: number): SkillId | undefined {
  const livingEnemies = enemies.filter(isAlive);
  const needsMana = actor.maxMp > 0 && actor.mp / actor.maxMp < 0.2;

  if (!needsMana && livingEnemies.length > 2 && canUseSkill(actor, 'arcaneWave', now) && roll(6, rng) > 2) {
    return 'arcaneWave';
  }

  if (!needsMana && livingEnemies.length > 1 && canUseSkill(actor, 'magicMissiles', now) && roll(6, rng) > 1) {
    return 'magicMissiles';
  }

  if (!needsMana && canUseSkill(actor, 'arcaneBlast', now) && roll(6, rng) > 2) {
    return 'arcaneBlast';
  }

  return canUseSkill(actor, 'wand', now) ? 'wand' : undefined;
}

function chooseHealerSkill(actor: ActorState, party: ActorState[], now: number): SkillId | undefined {
  const lowest = lowestHealthAlly(party);

  if (firstDeadAlly(party) && canUseSkill(actor, 'resurrect', now)) {
    return 'resurrect';
  }

  if (partyIsLow(party) && canUseSkill(actor, 'groupHeal', now)) {
    return 'groupHeal';
  }

  if (lowest && healthRatio(lowest) <= 0.7 && canUseSkill(actor, 'heal', now)) {
    return 'heal';
  }

  return canUseSkill(actor, 'smite', now) ? 'smite' : undefined;
}

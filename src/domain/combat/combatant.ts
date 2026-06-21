import type { ActorState, EnemyState, SkillId, SkillState } from '../types';
import { SKILLS } from './skillCatalog';

export type Combatant = ActorState | EnemyState;

const GLOBAL_COOLDOWN_MS = 250;

export function isAlive(actor: Combatant) {
  return actor.hp > 0;
}

export function isEnemy(actor: Combatant): actor is EnemyState {
  return 'token' in actor;
}

export function healthRatio(actor: Combatant) {
  return actor.maxHp === 0 ? 0 : actor.hp / actor.maxHp;
}

export function findSkill(actor: Combatant, id: SkillId) {
  return actor.skills?.find((skill) => skill.id === id);
}

export function canUseSkill(actor: Combatant, id: SkillId, now = Date.now()) {
  const skill = findSkill(actor, id);
  const charges = skill ? availableCharges(skill, id, now) : undefined;

  return Boolean(
    skill &&
      isAlive(actor) &&
      getActorGcdRemaining(actor, now) < 1 &&
      getSkillCooldownRemaining(skill, now) < 1 &&
      actor.mp >= SKILLS[id].mpCost &&
      (charges === undefined || charges > 0),
  );
}

export function beginSkillTimers(actor: Combatant, skill: SkillState, id: SkillId, now = Date.now()) {
  const definition = SKILLS[id];

  actor.gcdUntil = now + GLOBAL_COOLDOWN_MS;
  skill.cooldown = 0;
  skill.cooldownUntil = now + definition.cooldownMs;

  if (skill.charges === undefined) {
    return;
  }

  skill.charges = Math.max(0, (availableCharges(skill, id, now) ?? 0) - 1);
  if (definition.rechargeMs && skill.charges < (skill.maxCharges ?? skill.charges) && !skill.rechargeUntil) {
    skill.rechargeUntil = now + definition.rechargeMs;
  }
}

export function refreshTimedSkills(actor: Combatant, now = Date.now()) {
  if ((actor.gcdUntil ?? 0) <= now) {
    actor.gcdUntil = undefined;
  }

  actor.skills = (actor.skills ?? []).map((skill) => {
    const definition = SKILLS[skill.id];
    const next = { ...skill, cooldown: 0 };

    if ((next.cooldownUntil ?? 0) <= now) {
      next.cooldownUntil = undefined;
    }

    if (next.charges !== undefined && definition.rechargeMs && next.rechargeUntil) {
      while (next.charges < (next.maxCharges ?? next.charges) && next.rechargeUntil <= now) {
        next.charges++;
        next.rechargeUntil += definition.rechargeMs;
      }

      if (next.charges >= (next.maxCharges ?? next.charges)) {
        next.rechargeUntil = undefined;
      }
    }

    return next;
  });
}

export function getActorGcdRemaining(actor: Combatant, now = Date.now()) {
  return Math.max(0, (actor.gcdUntil ?? 0) - now);
}

export function getSkillCooldownRemaining(skill: SkillState, now = Date.now()) {
  return Math.max(0, (skill.cooldownUntil ?? 0) - now);
}

export function getSkillRechargeRemaining(skill: SkillState, now = Date.now()) {
  return Math.max(0, (skill.rechargeUntil ?? 0) - now);
}

export function getAvailableCharges(skill: SkillState, now = Date.now()) {
  return availableCharges(skill, skill.id, now);
}

export function spendMana(actor: Combatant, amount: number) {
  if (actor.mp < amount) {
    return false;
  }

  actor.mp -= amount;
  return true;
}

export function restoreMana(actor: Combatant, amount: number) {
  actor.mp = Math.min(actor.maxMp, actor.mp + amount);
}

export function heal(actor: Combatant, amount: number) {
  actor.hp = Math.min(actor.maxHp, actor.hp + Math.ceil(amount));
}

export function damage(actor: Combatant, amount: number) {
  actor.hp = Math.max(0, actor.hp - Math.ceil(amount));
}

function availableCharges(skill: SkillState, id: SkillId, now: number) {
  if (skill.charges === undefined) {
    return undefined;
  }

  const definition = SKILLS[id];
  const maxCharges = skill.maxCharges ?? skill.charges;

  if (!definition.rechargeMs || !skill.rechargeUntil || skill.charges >= maxCharges || now < skill.rechargeUntil) {
    return skill.charges;
  }

  const restored = 1 + Math.floor((now - skill.rechargeUntil) / definition.rechargeMs);
  return Math.min(maxCharges, skill.charges + restored);
}

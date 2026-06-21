import type { ActorAttributes, ActorState, EnemyState, HeroRole } from '../types';
import { isAlive } from './combatant';
import { roll, type Rng } from './rng';

export function grantRewards(party: ActorState[], defeated: EnemyState[], rng: Rng) {
  const xp = defeated.reduce((total, enemy) => total + monsterXp(enemy.level), 0);
  const gold = defeated.reduce((total, enemy) => total + monsterGold(enemy.level, rng), 0);

  return party.map((actor) => (isAlive(actor) ? grantActorRewards(actor, xp, gold) : actor));
}

export function monsterXp(level = 1, factor = 0.02, base = 5) {
  const scaled = Math.ceil((base * level) / 3);
  return scaled + Math.floor((scaled / 2) * factor);
}

export function monsterGold(level: number, rng: Rng, factor = 0.02, base = 5) {
  if (roll(10, rng) <= 8) {
    return 0;
  }

  const scaled = Math.ceil((base * level) / 3);
  return scaled + Math.floor((scaled / 2) * factor);
}

function grantActorRewards(actor: ActorState, xp: number, gold: number): ActorState {
  const next = { ...actor, attributes: { ...actor.attributes }, gold: actor.gold + gold, xp: actor.xp + xp };

  while (next.xp >= xpForNextLevel(next.level)) {
    next.xp -= xpForNextLevel(next.level);
    next.level++;
    next.attributes.available += 5;
    applyLevelBonus(next);
  }

  spendAvailablePoints(next);
  return next;
}

export function xpForNextLevel(level = 1, factor = 0.07, base = 50) {
  const scaled = Math.ceil(base * level);
  return scaled + Math.floor(scaled * factor);
}

function applyLevelBonus(actor: ActorState) {
  if (actor.role === 'warrior') {
    actor.maxHp += 20;
    actor.attributes.strength += 3;
  } else if (actor.role === 'mage') {
    actor.maxHp += 5;
    actor.maxMp += 3;
    actor.attributes.intellect += 2;
  } else {
    actor.maxHp += 10;
    actor.maxMp += 1;
    actor.attributes.intellect += 3;
  }

  actor.hp = actor.maxHp;
  actor.mp = actor.maxMp;
}

const POINT_PLANS: Record<HeroRole, (keyof Pick<ActorAttributes, 'strength' | 'vitality' | 'intellect'>)[]> = {
  warrior: ['strength', 'strength', 'strength', 'vitality', 'vitality'],
  mage: ['intellect', 'intellect', 'intellect', 'intellect', 'vitality'],
  healer: ['intellect', 'intellect', 'intellect', 'vitality', 'vitality'],
};

function spendAvailablePoints(actor: ActorState) {
  const plan = POINT_PLANS[actor.role];
  let index = 0;

  while (actor.attributes.available > 0) {
    buyAttribute(actor, plan[index % plan.length]);
    actor.attributes.available--;
    index++;
  }

  actor.hp = Math.min(actor.maxHp, actor.hp);
  actor.mp = Math.min(actor.maxMp, actor.mp);
}

function buyAttribute(actor: ActorState, attribute: keyof Pick<ActorAttributes, 'strength' | 'vitality' | 'intellect'>) {
  actor.attributes[attribute]++;

  if (attribute === 'vitality') {
    actor.maxHp += 2;
  }

  if (attribute === 'intellect') {
    actor.maxMp += 2;
  }
}

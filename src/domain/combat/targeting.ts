import type { ActorState, EnemyState } from '../types';
import { healthRatio, isAlive } from './combatant';
import { sample, type Rng } from './rng';

export function pickEnemy(enemies: EnemyState[], rng: Rng) {
  return sample(enemies.filter(isAlive), rng);
}

export function pickWeightedHero(party: ActorState[], rng: Rng) {
  const living = party.filter(isAlive);
  const warrior = living.find((actor) => actor.role === 'warrior');
  const healer = living.find((actor) => actor.role === 'healer');
  const mage = living.find((actor) => actor.role === 'mage');
  const weighted = [warrior, warrior, warrior, healer, warrior, warrior, warrior, mage, warrior, warrior, warrior].filter(Boolean) as ActorState[];

  return sample(weighted.length > 0 ? weighted : living, rng);
}

export function lowestHealthAlly(party: ActorState[]) {
  return party.filter(isAlive).sort((a, b) => healthRatio(a) - healthRatio(b))[0];
}

export function firstDeadAlly(party: ActorState[]) {
  return party.find((actor) => !isAlive(actor));
}

export function partyIsLow(party: ActorState[], threshold = 0.65) {
  const lowCount = party.filter((actor) => isAlive(actor) && healthRatio(actor) <= threshold).length;
  return lowCount > 0 && lowCount >= Math.floor(party.length * 0.4);
}

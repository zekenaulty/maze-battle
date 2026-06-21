import { roll, type Rng } from './rng';

export function shouldStartEncounter(rng: Rng) {
  return roll(100, rng) <= 35;
}

export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function roll(sides: number, rng: Rng = defaultRng) {
  return 1 + Math.floor(rng() * sides);
}

export function sample<T>(items: T[], rng: Rng = defaultRng) {
  return items[Math.floor(rng() * items.length)];
}

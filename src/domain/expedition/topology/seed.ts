import { validateSeed } from '../schematic';
import type { TopologyRecipe } from './types';

/** Keyed randomness: no ambient PRNG or dependence on geometry cache requests. */
export function keyedSeed(seed: number, key: string): number {
  let value = (seed ^ 2166136261) >>> 0;
  for (let index = 0; index < key.length; index++) value = Math.imul(value ^ key.charCodeAt(index), 16777619) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  return (value ^ (value >>> 13)) >>> 0;
}

export function validateRecipe(recipe: TopologyRecipe) {
  if (recipe.version !== 'spaces-v2') throw new Error('Unsupported topology recipe');
  validateSeed(recipe.seed);
  if (!Number.isSafeInteger(recipe.level) || recipe.level < 1 || !Number.isSafeInteger(6 + recipe.level * 2)) {
    throw new Error('Level exceeds safe finite-scope arithmetic');
  }
  for (const id of [recipe.worldId, recipe.floorId]) {
    if (typeof id !== 'string' || id.length > 128 || !id.trim()) throw new Error('Invalid world or floor ID');
  }
}

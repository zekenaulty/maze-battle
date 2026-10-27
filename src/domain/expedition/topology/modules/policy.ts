import { validateSeed } from '../../schematic';
import { STAIR_LAYOUT_VERSION } from '../../vertical';

export interface ModulePolicy {
  version: 'branching-v1';
  minSide: number;
  maxSide: number;
  maxPassage: number;
  joins: 'mixed' | 'direct' | 'passage';
  attempts: number;
}

export interface ModuleRecipe {
  version: 'modules-v3';
  worldId: string;
  floorId: string;
  level: number;
  seed: number;
  roomBudget: number;
  policy: ModulePolicy;
  spatial?: typeof STAIR_LAYOUT_VERSION;
  architecture?: 'open-chambers-v1';
}

export interface ModuleLimits { maxModules: number; maxProjectionCells: number }

// Versioned starting policies, not a permanent world-size or balance ceiling.
export const DEFAULT_MODULE_POLICY: Readonly<ModulePolicy> = Object.freeze({
  version: 'branching-v1', minSide: 5, maxSide: 15, maxPassage: 7, joins: 'mixed', attempts: 16,
});
export const DEFAULT_MODULE_LIMITS: Readonly<ModuleLimits> = Object.freeze({ maxModules: 256, maxProjectionCells: 65_536 });

export function moduleBudgetForLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || !Number.isSafeInteger(6 + 2 * level)) {
    throw new RangeError('Invalid module progression level');
  }
  return 6 + 2 * level;
}

export function createModuleRecipe(worldId: string, level: number, seed: number,
  options: { spatial?: boolean; architecture?: ModuleRecipe['architecture'] } = {}): ModuleRecipe {
  const recipe: ModuleRecipe = {
    version: 'modules-v3', worldId, floorId: `floor-${level}`, level, seed,
    roomBudget: moduleBudgetForLevel(level), policy: { ...DEFAULT_MODULE_POLICY },
  };
  if (options.spatial) { recipe.spatial = STAIR_LAYOUT_VERSION; recipe.policy.minSide = 9; }
  if (options.architecture !== undefined) recipe.architecture = options.architecture;
  validateModuleRecipe(recipe);
  return recipe;
}

export function validateModuleRecipe(recipe: ModuleRecipe) {
  if (!recipe || recipe.version !== 'modules-v3') throw new Error('Unsupported module recipe');
  validateSeed(recipe.seed);
  if (recipe.architecture !== undefined && recipe.architecture !== 'open-chambers-v1') throw new Error('Unsupported module architecture');
  moduleBudgetForLevel(recipe.level);
  for (const id of [recipe.worldId, recipe.floorId]) {
    if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new Error('Invalid module scope identity');
  }
  if (!Number.isSafeInteger(recipe.roomBudget) || recipe.roomBudget < 3) throw new Error('Invalid room budget');
  const p = recipe.policy;
  if (recipe.spatial !== undefined && (recipe.spatial !== STAIR_LAYOUT_VERSION || p?.minSide < 9)) throw new Error('Unsupported spatial recipe');
  if (!p || p.version !== 'branching-v1' || !['mixed', 'direct', 'passage'].includes(p.joins)
    || ![p.minSide, p.maxSide, p.maxPassage, p.attempts].every(Number.isSafeInteger)
    || p.minSide < 5 || p.maxSide > 15 || p.minSide > p.maxSide || p.minSide % 2 !== 1 || p.maxSide % 2 !== 1
    || p.maxPassage < 1 || p.maxPassage > 7 || p.attempts < 1 || p.attempts > 32) {
    throw new Error('Unsupported or invalid module policy');
  }
}

export function validateModuleLimits(limits: ModuleLimits) {
  if (![limits.maxModules, limits.maxProjectionCells].every(Number.isSafeInteger)
    || limits.maxModules < 3 || limits.maxProjectionCells < 1) throw new Error('Invalid module work limits');
}

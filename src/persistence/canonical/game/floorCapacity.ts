import type { ModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { validateModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import type { PrivatePreparationSpec } from '../privatePreparation';
import { preparationCapacity } from '../world/preparationCapacity';
import { json } from '../world/records';
import { INITIALIZATION_BOOT_POLICY, initializationCapacity } from './initializationCapacity';

/** Only public recipe bounds choose the budget; the full recipe binds its retained source. */
export function floorPreparationSpec(input: ModuleRecipe): PrivatePreparationSpec {
  const recipe = structuredClone(input); validateModuleRecipe(recipe);
  const { version, level, roomBudget, policy } = recipe, floor = { version, level, roomBudget, policy };
  const birth = level === 1;
  const budgetBytes = birth ? initializationCapacity({ floor, bootPolicy: INITIALIZATION_BOOT_POLICY }).budgetBytes
    : preparationCapacity(floor).budgetBytes;
  return { id: `floor-${level}`, budgetBytes, policy: { version: 'canonical-floor-allocation-v1',
    recipe: json(recipe), bootPolicy: birth ? INITIALIZATION_BOOT_POLICY : null } };
}

export const preparationWorldWrite = (level: number) => (key: string, index = false) => index
  ? key === `floors/${level}` || ['spaces', 'chests', 'contracts'].some(kind => key.startsWith(`${kind}/${level}/`))
  : key === 'dungeon'
  || key === `dungeon/${level}` || key.startsWith(`dungeon/${level}/`)
  || key === `dungeon/${level - 1}/stairs` || key === `game/preparation/${level}`
  || key.startsWith(`contract/floor-${level}:`);

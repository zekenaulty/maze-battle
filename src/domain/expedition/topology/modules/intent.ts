import type { Direction } from '../../../types';
import type { SpaceSpec } from '../../types';
import type { ModuleRecipe } from './policy';

/** Existing socket/room counters and :room IDs name anchored modules. Kind owns semantics.
 * Select intent before sizing/reservation; never infer a chamber from that wire name. */
export const hasCirculation = (recipe: ModuleRecipe) => recipe.architecture === 'circulation-v1' || recipe.architecture === 'dedicated-stairs-v1';
export function moduleIntent(recipe: ModuleRecipe, ordinal: number): NonNullable<SpaceSpec['circulation']> | 'chamber' | 'stairwell' {
  if (recipe.architecture === 'dedicated-stairs-v1' && (ordinal === 0 || ordinal === recipe.roomBudget - 1)) return 'stairwell';
  if (!hasCirculation(recipe) || ordinal === 0 || ordinal === recipe.roomBudget - 1 || ordinal % 4 === 2) return 'chamber';
  return ordinal === 1 || ordinal % 2 === 0 ? 'junction' : 'run';
}

export function moduleOrdinal(id: string): number {
  if (id === 'entry') return 0;
  const match = /^socket-(0|[1-9]\d*):room$/.exec(id);
  if (!match || !Number.isSafeInteger(Number(match[1]) + 1)) throw Error('Invalid anchored module identity');
  return Number(match[1]) + 1;
}

export const isModuleChamber = (recipe: ModuleRecipe, id: string) => moduleIntent(recipe, moduleOrdinal(id)) === 'chamber';
export const isModuleRoom = (recipe: ModuleRecipe, id: string) => ['chamber', 'stairwell'].includes(moduleIntent(recipe, moduleOrdinal(id)));
export const moduleEntryBounds = (recipe: ModuleRecipe) => recipe.architecture === 'dedicated-stairs-v1'
  ? { row: 0, column: 0, rows: 9, columns: 3 }
  : { row: 0, column: 0, rows: Math.max(recipe.policy.minSide, Math.min(9, recipe.policy.maxSide)),
    columns: Math.max(recipe.policy.minSide, Math.min(9, recipe.policy.maxSide)) };

/** O(1) count of role nodes, including entry/exit anchors, in the accepted prefix.
 * Dedicated wells are route anchors; only ordinary chambers can receive specialties. */
export function moduleRoleRoomsInPrefix(recipe: ModuleRecipe, prefix: number): number {
  if (!hasCirculation(recipe)) return prefix;
  return Number(prefix > 0) + Math.floor((prefix + 1) / 4)
    + Number(prefix === recipe.roomBudget && (recipe.roomBudget - 1) % 4 !== 2);
}

export function circulationDimensions(intent: SpaceSpec['circulation'], direction: Direction, value: number) {
  if (intent === 'junction') return { rows: 3, columns: 3 };
  const length = 5 + 2 * (value % 2);
  return direction === 'north' || direction === 'south' ? { rows: length, columns: 1 } : { rows: 1, columns: length };
}

export function validModuleIntent(recipe: ModuleRecipe, space: SpaceSpec): boolean {
  const intent = moduleIntent(recipe, moduleOrdinal(space.id));
  const open = (intent === 'chamber' || intent === 'stairwell') && recipe.architecture !== undefined;
  if (space.interior !== (open ? 'open-room-v1' : undefined) || space.furnishing !== (open ? 'none' : undefined)) return false;
  if (space.purpose !== (intent === 'stairwell' ? 'stairwell-v1' : undefined)) return false;
  if (intent === 'stairwell') return space.kind === 'room' && space.circulation === undefined && space.rows === 9 && space.columns === 3;
  if (intent === 'chamber') return space.kind === 'room' && space.circulation === undefined
    && [space.rows, space.columns].every(side => side >= recipe.policy.minSide && side <= recipe.policy.maxSide && side % 2 === 1);
  return space.kind === 'passage' && space.circulation === intent && (intent === 'junction'
    ? space.rows === 3 && space.columns === 3
    : (space.rows === 1 && [5, 7].includes(space.columns)) || (space.columns === 1 && [5, 7].includes(space.rows)));
}

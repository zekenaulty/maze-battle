import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';

export type ExplorationVariant = 'A' | 'B';
export type ExplorationScene = 'unopened-chest' | 'opened-chest' | 'stairs' | 'scope-boundary';
export const EXPLORATION_WORLD = 'frontier-exploration-pair';
export const EXPLORATION_SPACE = 'socket-6:room';
export const EXPLORATION_MARKER = { row: 9, column: 5 };

// Setup/audit data only. Neither the selector nor the navigation binding receives a variant.
export function explorationRecipe(variant: ExplorationVariant) {
  if (variant !== 'A' && variant !== 'B') throw Error('Unknown exploration fixture variant');
  const recipe = createModuleRecipe(EXPLORATION_WORLD, 1, variant === 'A' ? 177 : 349);
  return { ...recipe, roomBudget: 8,
    policy: { ...recipe.policy, minSide: 15, maxSide: 15, joins: 'direct' as const } };
}

export function explorationActor(spaceId = EXPLORATION_SPACE): WorldPosition {
  return { level: 1, cell: { spaceId, row: 14, column: 0 } };
}

export const EXPLORATION_PAIR_ORACLE = {
  origin: { row: 15, column: -15 },
  entrance: { row: 7, column: 14 },
  firstAnchor: { row: 7, column: 0 },
  firstDirection: 'north',
  equalNorthMoves: 2,
  firstDifferentNorthMove: 3,
  visibleCounts: [36, 43, 49, 54],
  A: { blocked: 'north', unresolved: 'east' },
  B: { blocked: 'east', unresolved: 'north' },
} as const;

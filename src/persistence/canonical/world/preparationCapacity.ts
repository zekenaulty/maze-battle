import type { ModulePolicy } from '../../../domain/expedition/topology/modules/policy';
import type { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { validateModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { preparationRecordBytes as row, preparationTreeBytes as tree, preparationPathsBytes as paths,
  preparationAllocationBytes, preparationBucketNodes, preparationBucketKeyLength, type PreparationKeys } from './preparationCapacity.bytes';

export interface PreparationPublicBounds {
  version: 'modules-v3'; level: number; roomBudget: number; policy: ModulePolicy;
  spatial?: typeof STAIR_LAYOUT_VERSION;
  architecture?: 'open-chambers-v1';
}
export type PreparationCapacityPhase = 'bootstrap' | 'generation' | 'quality' | 'roles' | 'content';
export interface PreparationPhaseCapacity {
  calls: number; recordsBytes: number; nodesBytes: number; receiptsBytes: number; budgetBytes: number;
}
export interface PreparationCapacity {
  version: 'canonical-floor-preparation-v1'; budgetBytes: number; allocationBytes: number;
  phases: Record<PreparationCapacityPhase, PreparationPhaseCapacity>;
}

/** Current canonical generator/preparation writer grammar only. No world reads, seed, allocation or ledger mutation.
 * Excludes roster/gameplay/bootstrap settings. Allocation metadata has an explicit prospective
 * one-anchor contract; it is NOT permission to charge arbitrary mixed-transaction work. */
export function preparationCapacity(input: PreparationPublicBounds): PreparationCapacity {
  const b = structuredClone(input);
  fields(b, 'version level roomBudget policy', 'spatial architecture');
  fields(b.policy, 'version minSide maxSide maxPassage joins attempts');
  validateModuleRecipe({ ...b, worldId: 'x'.repeat(128), floorId: `floor-${b.level}`, seed: 0 });
  const n = b.roomBudget, coordinate = 22 * (n + 1);
  check(Number.isSafeInteger(coordinate), 'preparation capacity coordinate bound exceeds safe arithmetic');
  const d = String(n).length, l = String(b.level).length, c = String(Math.ceil(coordinate / 16)).length;
  const floor = 8 + l, space = 16 + d, key = floor + 12 + space;
  const bucketKey = preparationBucketKeyLength(l, c);
  const ordinary: PreparationKeys = { count: 0, length: key + 7, variablePositions: d, localBranches: 3 };
  const indexed = (count: number): PreparationKeys => ({ ...ordinary, count });
  const bucketNodes = preparationBucketNodes(bucketKey + 7, c, n);
  const fixed: PreparationKeys = { count: 4, length: floor + 32, variablePositions: 0 };
  const bucketRows = (entries: number) => 25 * row(bucketKey, 2) + entries * (160 + 2 * String(coordinate).length + d);
  const phase = (calls: number, recordsBytes: number, keys: PreparationKeys[], extra = 0, extraNodes = 0): PreparationPhaseCapacity => {
    const nodesBytes = calls * tree(l, keys) + extraNodes, receiptsBytes = calls * 4096;
    return { calls, recordsBytes: calls * recordsBytes + extra, nodesBytes, receiptsBytes,
      budgetBytes: calls * recordsBytes + extra + nodesBytes + receiptsBytes };
  };
  const preparation = row(17 + l, 128), floorRow = row(floor, 4096, [7 + l]);
  const bootstrap = phase(1, floorRow + row(7, 512) + row(key, 1024, [12 + l + space])
    + row(key, 1024) + Math.min(4, n - 1) * row(key, 2048) + bucketRows(28)
    + preparation + (b.level > 1 ? row(key, 1024) : 0), [fixed, indexed(10)], 0, bucketNodes);
  const generation = phase(n - 1, floorRow + 2 * row(key, 1024, [12 + l + space])
    + 3 * row(key, 1024) + 3 * row(key, 2048) + 2 * row(key, 1024) + row(key, 512)
    + bucketRows(6 * n - 2) + preparation
    // Terminal spatial expansion may rewrite an older farthest room, in addition to its new room/passage.
    + (b.spatial ? row(key, 1024, [12 + l + space]) : 0),
  [fixed, indexed(b.spatial ? 19 : 17)], 2 * row(key, 4096), (n - 1) * bucketNodes);
  const quality = phase(Math.ceil(n / 4), 4 * row(key, 2048) + row(key, 4096) + preparation,
    [fixed, indexed(6)], row(key, 4096));
  const roles = phase(Math.ceil(n / 8), row(key, 4096) + preparation,
    [fixed, indexed(2)], row(key, 4096));
  const contentKeys = { count: 16, length: 64 + 2 * d + 2 * l, variablePositions: 2 * d + 5 };
  const content = phase(Math.ceil(n / 2), 2 * row(key, 512) + row(key, 4096) + preparation,
    [fixed, indexed(4)],
    2 * row(contentKeys.length, 512, [contentKeys.length])
      + 6 * row(contentKeys.length, 4140, [contentKeys.length]), paths([contentKeys]));
  const phases = { bootstrap, generation, quality, roles, content }, allocationBytes = preparationAllocationBytes();
  const budgetBytes = allocationBytes + Object.values(phases).reduce((sum, p) => sum + p.budgetBytes, 0);
  check(integer(budgetBytes, 1), 'preparation capacity exceeds safe arithmetic');
  return { version: 'canonical-floor-preparation-v1', budgetBytes, allocationBytes, phases };
}

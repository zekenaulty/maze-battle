import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { preparationCapacity, type PreparationCapacity, type PreparationPublicBounds } from '../world/preparationCapacity';
import { preparationNodeBytes, preparationRecordBytes } from '../world/preparationCapacity.bytes';

export const INITIALIZATION_BOOT_POLICY = 'canonical-rpg-default-v1' as const;
export interface InitializationCapacityInput {
  floor: PreparationPublicBounds; bootPolicy: typeof INITIALIZATION_BOOT_POLICY;
}
export interface InitializationCapacity {
  version: 'canonical-game-initialization-v1'; scope: 'initialization-and-floor';
  bootPolicy: typeof INITIALIZATION_BOOT_POLICY;
  publicBirth: { recordsBytes: number; nodesBytes: number; budgetBytes: number };
  privateFloor: PreparationCapacity; birthBytes: number; budgetBytes: number;
}

// Encoded default rows, including UTF-8 supplies and stored actor/item wrappers.
// The complete initializer policy golden must change if any default value changes.
const publicRows = [
  { key: 13, value: 33 }, // settings
  { key: 12, value: 162 }, { key: 11, value: 60 }, // party, pack
  { key: 12, value: 50 }, { key: 13, value: 148 }, // stash, policy
  { key: 57, value: 500 }, { key: 54, value: 522 }, { key: 56, value: 484 }, // heroes
  { key: 48, value: 292, index: 71 }, { key: 48, value: 289, index: 71 },
  { key: 48, value: 277, index: 71 }, // health herb, mana vial, town portal
];

/** Fixed new-game producer only: empty roots and ONE final flush. No seed/world reads,
 * RNG, roster input or ledger mutation. Head accounting remains separate. Integration
 * must snapshot once, validate the exact boot policy and write those same values. */
export function initializationCapacity(input: InitializationCapacityInput): InitializationCapacity {
  const b = structuredClone(input);
  fields(b, 'floor bootPolicy');
  check(b.bootPolicy === INITIALIZATION_BOOT_POLICY, 'unsupported initialization boot policy');
  const privateFloor = preparationCapacity(b.floor);
  check(b.floor.level === 1, 'initialization requires floor one');
  const recordsBytes = publicRows.reduce((sum, r) => sum + preparationRecordBytes(r.key, r.value,
    r.index === undefined ? [] : [r.index]), 0);
  const paths = publicRows.length + publicRows.filter(r => r.index !== undefined).length;
  const length = Math.max(...publicRows.flatMap(r => [7 + r.key, ...(r.index === undefined ? [] : [6 + r.index])]));
  // In the union trie each disjoint inserted path adds <=2 nodes and <=2 edges.
  // Rebuilt ancestors replace pending nodes; they are not retained a second time.
  const edgeBytes = preparationNodeBytes(length, 2) - preparationNodeBytes(length, 1);
  const nodesBytes = 2 * paths * (preparationNodeBytes(length, 0) + edgeBytes);
  const publicBirth = { recordsBytes, nodesBytes, budgetBytes: recordsBytes + nodesBytes };
  const birthBytes = privateFloor.allocationBytes + privateFloor.phases.bootstrap.budgetBytes + publicBirth.budgetBytes;
  const budgetBytes = privateFloor.budgetBytes + publicBirth.budgetBytes;
  check(integer(birthBytes, 1) && integer(budgetBytes, 1), 'initialization capacity exceeds safe arithmetic');
  return { version: 'canonical-game-initialization-v1', scope: 'initialization-and-floor',
    bootPolicy: b.bootPolicy, publicBirth, privateFloor, birthBytes, budgetBytes };
}

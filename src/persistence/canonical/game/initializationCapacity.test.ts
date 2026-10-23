// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { preparationCapacity } from '../world/preparationCapacity';
import { INITIALIZATION_BOOT_POLICY, initializationCapacity } from './initializationCapacity';

function input() {
  const { version, level, roomBudget, policy } = createModuleRecipe('world', 1, 0);
  return { floor: { version, level, roomBudget, policy }, bootPolicy: INITIALIZATION_BOOT_POLICY };
}

it('separates fixed public birth, private preparation and one prospective anchor', () => {
  const b = input(), result = initializationCapacity(b);
  expect(result.scope).toBe('initialization-and-floor');
  expect(result.version).toBe('canonical-game-initialization-v1');
  expect(result.publicBirth).toEqual({ recordsBytes: 9865, nodesBytes: 27496, budgetBytes: 37361 });
  expect(result.privateFloor).toEqual(preparationCapacity(b.floor));
  expect(result.budgetBytes).toBe(5_163_857);
  expect(result.birthBytes).toBe(1_478_056);
  expect(result.birthBytes).toBe(result.privateFloor.allocationBytes + result.privateFloor.phases.bootstrap.budgetBytes + 37_361);
  expect(result.budgetBytes).toBe(result.privateFloor.budgetBytes + result.publicBirth.budgetBytes);
});

it('is pure, snapshots inputs and returns independently owned components', () => {
  const random = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('RNG forbidden'); });
  const values = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => { throw new Error('RNG forbidden'); });
  try {
    const b = input(), first = initializationCapacity(b), second = initializationCapacity(b);
    b.floor.policy.maxSide = 5; expect(first).toEqual(second);
    first.publicBirth.budgetBytes = 0; first.privateFloor.phases.bootstrap.budgetBytes = 0;
    expect(second).toEqual(initializationCapacity(input()));
  } finally { random.mockRestore(); values.mockRestore(); }
});

it.each(['roster', 'seed', 'world', 'boot', 'level', 'private-floor', 'policy'] as const)('refuses unsupported %s input', defect => {
  const b = input();
  if (defect === 'roster') Object.assign(b, { roster: {} });
  if (defect === 'seed') Object.assign(b, { seed: 0 });
  if (defect === 'world') Object.assign(b, { world: {} });
  if (defect === 'boot') Object.assign(b, { bootPolicy: 'arbitrary' });
  if (defect === 'level') b.floor.level = 2;
  if (defect === 'private-floor') Object.assign(b.floor, { seed: 0 });
  if (defect === 'policy') b.floor.policy.maxSide = 17;
  expect(() => initializationCapacity(b)).toThrow();
});

it('retains the 16-floor fit with public birth charged only once', () => {
  let bytes = initializationCapacity(input()).budgetBytes;
  for (let level = 2; level <= 16; level++) {
    const { version, roomBudget, policy } = createModuleRecipe('world', level, 0);
    bytes += preparationCapacity({ version, level, roomBudget, policy }).budgetBytes;
  }
  expect(bytes).toBe(239_493_859);
  expect(256 * 1024 ** 2 - 8 * 1024 ** 2 - 12 * 1024 - bytes).toBe(20_540_701);
});

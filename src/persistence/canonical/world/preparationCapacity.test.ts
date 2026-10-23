// @vitest-environment node
import { expect, it } from 'vitest';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { preparationCapacity, type PreparationPublicBounds } from './preparationCapacity';

export function capacityBounds(level = 1): PreparationPublicBounds {
  const { version, roomBudget, policy } = createModuleRecipe('world', level, 1);
  return { version, level, roomBudget, policy };
}

it('reserves a useful cumulative 16-floor budget without seed or realized topology', () => {
  const sizes = Array.from({ length: 16 }, (_, i) => preparationCapacity(capacityBounds(i + 1)).budgetBytes);
  console.info(JSON.stringify({ perFloor: sizes, cumulativeBytes: sizes.reduce((a, b) => a + b), MiB: sizes.reduce((a, b) => a + b) / 1024 ** 2 }));
  // Even the current storedBytes ceiling, charged once, fits; the parent owns its tighter head policy.
  expect(sizes.reduce((a, b) => a + b) + 128 * 1024 + 8 * 1024 ** 2).toBeLessThan(256 * 1024 ** 2);
});

it('accounts for floor/ordinal digit transitions and refuses unrepresentable totals', () => {
  for (const [a, b] of [[9, 10], [99, 100]]) {
    const smaller = { ...capacityBounds(a), roomBudget: a }, larger = { ...capacityBounds(b), roomBudget: b };
    expect(preparationCapacity(larger).budgetBytes).toBeGreaterThan(preparationCapacity(smaller).budgetBytes);
  }
  expect(() => preparationCapacity({ ...capacityBounds(), roomBudget: 100_000_000_000 })).toThrow(/safe arithmetic/);
});

it('has exact component totals, stable versions and owned output', () => {
  const input = capacityBounds(), a = preparationCapacity(input), b = preparationCapacity(input);
  expect(a).toEqual(b); input.policy.maxSide = 5;
  expect(a).toEqual(b); a.phases.bootstrap.budgetBytes = 0; expect(a).not.toEqual(b);
  expect(b.version).toBe('canonical-floor-preparation-v1');
  for (const phase of Object.values(b.phases)) expect(phase.budgetBytes).toBe(phase.recordsBytes + phase.nodesBytes + phase.receiptsBytes);
  expect(b.budgetBytes).toBe(b.allocationBytes + Object.values(b.phases).reduce((sum, p) => sum + p.budgetBytes, 0));
});

it.each(['seed', 'topology', 'unsafe', 'policy', 'version'] as const)('rejects invalid/private %s inputs', defect => {
  const value = capacityBounds();
  if (defect === 'seed') Object.assign(value, { seed: 1 });
  if (defect === 'topology') Object.assign(value, { passages: 2 });
  if (defect === 'unsafe') value.roomBudget = Number.MAX_SAFE_INTEGER;
  if (defect === 'policy') value.policy.maxSide = 17;
  if (defect === 'version') Object.assign(value, { version: 'modules-v4' });
  expect(() => preparationCapacity(value)).toThrow();
});

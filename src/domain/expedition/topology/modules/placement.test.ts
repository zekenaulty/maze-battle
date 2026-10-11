import { expect, it, vi } from 'vitest';
import { moduleSpace, reserveModuleSockets, spaceOccupancy } from './placement';
import { createModuleRecipe } from './policy';

it('exhausts blocked socket candidates within policy bounds without publishing a partial reservation', () => {
  const recipe = createModuleRecipe('blocked-candidates', 1, 42);
  const root = moduleSpace('entry', 'room', { row: 0, column: 0, rows: 9, columns: 9 }, 42);
  const added = [spaceOccupancy(root)];
  const before = structuredClone({ root, added });
  const occupied = vi.fn(() => true);
  const work = { candidates: 0, occupancyQueries: 0, localChecks: 0 };
  expect(reserveModuleSockets(recipe, root, 0, 7, undefined, occupied, added, work)).toEqual([]);
  expect(work.candidates).toBe(4 * recipe.policy.attempts);
  expect(occupied).toHaveBeenCalledTimes(4 * recipe.policy.attempts);
  expect({ root, added }).toEqual(before);
});

it('does no candidate work after the accepted room quota is satisfied', () => {
  const recipe = createModuleRecipe('zero-quota', 1, 42);
  const root = moduleSpace('entry', 'room', { row: 0, column: 0, rows: 9, columns: 9 }, 42);
  const occupied = vi.fn(() => false);
  const work = { candidates: 0, occupancyQueries: 0, localChecks: 0 };
  expect(reserveModuleSockets(recipe, root, 0, 0, undefined, occupied, [], work)).toEqual([]);
  expect(work).toEqual({ candidates: 0, occupancyQueries: 0, localChecks: 0 });
  expect(occupied).not.toHaveBeenCalled();
});

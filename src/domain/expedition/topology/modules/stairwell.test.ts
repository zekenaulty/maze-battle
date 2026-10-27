import { expect, it } from 'vitest';
import { ModuleAssembly } from './assembly';
import { createModuleRecipe, validateModuleRecipe } from './policy';
import { assertModuleQuality } from './quality';
import { moduleRoleRoomsInPrefix } from './intent';
import { materializeSpace } from '../../schematic';
import { materializeStairRoom, STAIR_LAYOUT_VERSION } from '../../vertical';

it('reserves both dedicated stair envelopes before placement while ordinary rooms stay small and open', () => {
  for (const seed of [1, 2, 3, 7, 42, 73, 1729, 0xdeadbeef]) for (const level of [1, 10, 30]) {
    const recipe = createModuleRecipe('dedicated-test', level, seed, { spatial: true, architecture: 'dedicated-stairs-v1' });
    const assembly = new ModuleAssembly(recipe), state = assembly.finish(), q = assertModuleQuality(state);
    expect(q.stairwells).toBe(2); expect(q.chambers).toBe(moduleRoleRoomsInPrefix(recipe, recipe.roomBudget) - 2);
    expect(state.spaces[0].purpose).toBe('stairwell-v1');
    expect(state.spaces.at(-1)!.purpose).toBe('stairwell-v1');
    for (const space of state.spaces) {
      expect(materializeSpace(space).cells).toHaveLength(space.rows * space.columns);
      if (space.purpose) {
        expect([space.rows, space.columns]).toEqual([9, 3]);
        for (const end of ['upper', 'lower'] as const) {
          const geometry = materializeStairRoom(space, { version: STAIR_LAYOUT_VERSION, end });
          expect(geometry.cells).toHaveLength(24);
          for (const link of state.connections) for (const port of [link.from, link.to].filter(p => p.spaceId === space.id))
            expect(geometry.cells.some(c => c.row === port.row && c.column === port.column)).toBe(true);
        }
      } else if (space.kind === 'room') {
        expect([space.rows, space.columns].every(s => s === 3 || s === 5)).toBe(true);
        expect(space.furnishing).toBe('none');
      }
    }
    expect(new ModuleAssembly(recipe).finish()).toEqual(state);
  }
}, 30_000);

it('keeps the compact stair envelope opt-in, validates purpose and rejects an unbound spatial policy', () => {
  const recipe = createModuleRecipe('guard', 1, 42, { spatial: true, architecture: 'dedicated-stairs-v1' });
  const room = new ModuleAssembly(recipe).snapshot().spaces[0];
  expect(() => materializeStairRoom({ ...room, purpose: undefined }, { version: STAIR_LAYOUT_VERSION, end: 'upper' })).toThrow('Incompatible stair-room layout');
  expect(() => materializeSpace({ ...room, columns: 5 })).toThrow('Unsupported space purpose geometry');
  expect(() => validateModuleRecipe({ ...recipe, spatial: undefined })).toThrow('Invalid dedicated stair policy');
});

it('retains finite expansion and structural gates for prime and capacity-edge budgets', () => {
  for (const roomBudget of [5, 7, 11, 127, 256]) for (const seed of [1, 42]) {
    const recipe = { ...createModuleRecipe('edges', 1, seed, { spatial: true, architecture: 'dedicated-stairs-v1' }), roomBudget };
    const a = new ModuleAssembly(recipe), state = a.finish(), q = assertModuleQuality(state);
    expect(q.rooms).toBe(roomBudget); expect(q.stairwells).toBe(2);
    expect(a.work.candidates).toBeLessThanOrEqual(roomBudget * 10 * recipe.policy.attempts);
  }
});

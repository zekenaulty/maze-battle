import { expect, it } from 'vitest';
import { ModuleAssembly } from './assembly';
import { createModuleRecipe, validateModuleRecipe } from './policy';
import { assertModuleQuality } from './quality';
import { moduleRoleRoomsInPrefix, moduleIntent } from './intent';
import { materializeSpace } from '../../schematic';
import { opposite } from '../../../maze/movement';
import { generateModuleMaze } from '../../../maze/moduleGenerate';
import { bootstrapModule, proposeModuleStep } from './step';

it('builds actual circulation and empty destination chambers deterministically across seeds and depths', () => {
  for (const seed of [1, 2, 3, 7, 42, 73, 1729, 0xdeadbeef]) for (const level of [1, 10, 30]) {
    const recipe = createModuleRecipe('circulation-test', level, seed, { spatial: true, architecture: 'circulation-v1' });
    const state = new ModuleAssembly(recipe).finish();
    const quality = assertModuleQuality(state);
    expect(quality.reachable).toBe(recipe.roomBudget);
    expect(quality.chambers).toBe(moduleRoleRoomsInPrefix(recipe, recipe.roomBudget));
    expect(quality.junctions).toBeGreaterThan(0); expect(quality.runs).toBeGreaterThan(0);
    expect(state.spaces.some(s => s.circulation === 'junction'
      && state.connections.filter(c => c.from.spaceId === s.id || c.to.spaceId === s.id).length >= 3)).toBe(true);
    expect(state.spaces).toHaveLength(recipe.roomBudget);
    for (let n = 0; n < state.spaces.length; n++) {
      const s = state.spaces[n], intent = moduleIntent(recipe, n);
      expect(moduleRoleRoomsInPrefix(recipe, n + 1)).toBe(state.spaces.slice(0, n + 1).filter(s => s.kind === 'room').length);
      expect(s.kind).toBe(intent === 'chamber' ? 'room' : 'passage');
      expect(materializeSpace(s).cells).toHaveLength(s.rows * s.columns);
      if (s.kind === 'room') expect(s.furnishing).toBe('none');
      if (s.circulation === 'run') {
        const ports = state.connections.filter(c => c.from.spaceId === s.id || c.to.spaceId === s.id)
          .map(c => c.from.spaceId === s.id ? c.direction : opposite(c.direction));
        expect(ports.length).toBeLessThanOrEqual(2);
        expect(ports.every(d => s.rows === 1 ? ['east', 'west'].includes(d) : ['north', 'south'].includes(d))).toBe(true);
      }
    }
    expect(new ModuleAssembly(recipe).finish()).toEqual(state);
  }
}, 30_000);

it('rejects the obsolete room-only eager projection rather than misclassifying circulation as rewarded rooms', () => {
  expect(() => generateModuleMaze(createModuleRecipe('eager-circulation', 1, 42, { architecture: 'circulation-v1' })))
    .toThrow('Circulation requires canonical space topology');
});

it('rejects incompatible family policy and changed pending intent', () => {
  const recipe = createModuleRecipe('bindings', 1, 42, { architecture: 'circulation-v1' });
  expect(() => validateModuleRecipe({ ...recipe, policy: { ...recipe.policy, joins: 'mixed' } })).toThrow('Invalid circulation policy');
  const a = new ModuleAssembly(recipe), d = a.propose(0, 'tamper')!;
  d.spaces[0].kind = 'room';
  expect(() => a.commit(d)).toThrow('Invalid module proposal');
  const initial = bootstrapModule(recipe);
  initial.pending[0].room.circulation = 'run';
  expect(() => proposeModuleStep(initial.state, initial.pending[0], initial.space, () => false, 'stored-tamper'))
    .toThrow('Invalid module intent binding');
});

import { expect, it } from 'vitest';
import { materializeSpace } from '../../schematic';
import { materializeStairRoom, stairReservedCells, STAIR_LAYOUT_VERSION } from '../../vertical';
import { ModuleAssembly } from './assembly';
import { createModuleRecipe, validateModuleRecipe } from './policy';

it('keeps the same legal topology while explicitly opening every selected chamber across seeds and depths', () => {
  for (const seed of [1, 2, 3, 7, 42, 73, 1729, 0xdeadbeef]) for (const level of [1, 10, 30]) {
    const legacy = new ModuleAssembly(createModuleRecipe('open-comparison', level, seed, { spatial: true })).finish();
    const recipe = createModuleRecipe('open-comparison', level, seed, { spatial: true, architecture: 'open-chambers-v1' });
    const open = new ModuleAssembly(recipe).finish();
    expect(open.joins).toEqual(legacy.joins); expect(open.connections).toEqual(legacy.connections);
    expect(open.spaces.map(({ interior: _i, furnishing: _f, ...s }) => s)).toEqual(legacy.spaces);
    for (const room of open.spaces.filter(s => s.kind === 'room')) {
      expect(room.furnishing).toBe('none');
      const geometry = materializeSpace(room);
      expect(geometry.cells).toHaveLength(room.rows * room.columns);
      for (const c of geometry.cells) {
        expect(c.links.length).toBe(4 - Number(c.row === 0 || c.row === room.rows - 1)
          - Number(c.column === 0 || c.column === room.columns - 1));
      }
    }
    expect(new ModuleAssembly(recipe).finish()).toEqual(open);
  }
}, 30_000);

it('retains legacy masks and reserves only the intended stair shaft on open interiors', () => {
  const old = new ModuleAssembly(createModuleRecipe('stairs', 1, 42, { spatial: true })).finish().spaces[0];
  expect(materializeSpace(old).cells.length).toBeLessThan(old.rows * old.columns);
  const room = { ...old, interior: 'open-room-v1' as const, furnishing: 'none' as const };
  for (const end of ['upper', 'lower'] as const) {
    const layout = { version: STAIR_LAYOUT_VERSION, end }, geometry = materializeStairRoom(room, layout);
    expect(geometry.cells).toHaveLength(room.rows * room.columns - 3);
    for (const hole of stairReservedCells(room, layout)) expect(geometry.cells.some(c => c.row === hole.row && c.column === hole.column)).toBe(false);
  }
});

it('rejects unknown profiles and attempts to change architecture inside an existing reservation', () => {
  const recipe = createModuleRecipe('binding', 1, 42, { architecture: 'open-chambers-v1' });
  expect(() => validateModuleRecipe({ ...recipe, architecture: 'future' } as never)).toThrow('Unsupported module architecture');
  const assembly = new ModuleAssembly(recipe), delta = assembly.propose(0, 'proposal')!;
  delta.spaces[0].interior = undefined;
  expect(() => assembly.commit(delta)).toThrow('Invalid module proposal');
  const room = assembly.snapshot().spaces[0];
  expect(() => materializeSpace({ ...room, interior: 'unknown' } as never)).toThrow('Unsupported space interior');
  expect(() => materializeSpace({ ...room, furnishing: 'unknown' } as never)).toThrow('Unsupported space furnishing');
});

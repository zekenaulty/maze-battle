import { expect, it } from 'vitest';
import { alignedLowerFrame, floorPoint, materializeStairRoom, stairReservedCells, STAIR_LAYOUT_VERSION } from './vertical';
import { createModuleRecipe } from './topology/modules/policy';
import { preparationCapacity } from '../../persistence/canonical/world/preparationCapacity';

it('keeps both reserved stair rooms connected for every seed pattern and supported size', () => {
  for (const rows of [9, 11, 13, 15]) for (const columns of [9, 11, 13, 15]) for (let seed = 0; seed < 256; seed++) {
    const spec = { id: 'room', kind: 'room' as const, name: 'Room', origin: { row: -200, column: 300 }, rows, columns, seed, openings: [], chests: [] };
    for (const end of ['upper', 'lower'] as const) {
      const layout = { version: STAIR_LAYOUT_VERSION, end }, g = materializeStairRoom(spec, layout);
      expect(g.cells.some(c => c.row === rows >> 1 && c.column === columns >> 1)).toBe(true);
      for (const at of stairReservedCells(spec, layout)) expect(g.cells.some(c => c.row === at.row && c.column === at.column)).toBe(false);
      expect(g.cells.filter(c => c.row === 0)).toHaveLength(columns);
      expect(g.cells.filter(c => c.row === rows - 1)).toHaveLength(columns);
    }
  }
});
it('aligns translated negative-origin landings without accumulated decimal drift', () => {
  let frame: [number, number, number] = [0, 0, 0];
  for (let level = 0; level < 100; level++) {
    const upper = { row: -123 + level, column: 230 - level }, lower = { row: -4, column: 4 };
    const next = alignedLowerFrame(frame, upper, lower), a = floorPoint(frame, upper), b = floorPoint(next, lower);
    expect(b[0]).toBeCloseTo(a[0], 8); expect(b[1]).toBeCloseTo(a[1] - 4.68, 8); expect(b[2]).toBeCloseTo(a[2] - 9.36, 8);
    frame = next;
  }
  expect(() => alignedLowerFrame([1e9, 0, 0], { row: 0, column: 100 }, { row: 0, column: 0 })).toThrow();
});
it('pins opt-in spatial generation and explicitly funds its extra retained room rewrite', () => {
  const legacy = createModuleRecipe('world', 1, 42), spatial = createModuleRecipe('world', 1, 42, { spatial: true });
  expect(legacy.spatial).toBeUndefined(); expect(legacy.policy.minSide).toBe(5);
  expect(spatial.spatial).toBe(STAIR_LAYOUT_VERSION); expect(spatial.policy.minSide).toBe(9);
  const bounds = ({ version, level, roomBudget, policy, spatial }: typeof legacy) => ({ version, level, roomBudget, policy, ...(spatial ? { spatial } : {}) });
  const a = preparationCapacity(bounds(legacy)), b = preparationCapacity(bounds(spatial));
  expect(b.phases.generation.recordsBytes).toBeGreaterThan(a.phases.generation.recordsBytes);
  expect(b.phases.generation.nodesBytes).toBeGreaterThan(a.phases.generation.nodesBytes);
});

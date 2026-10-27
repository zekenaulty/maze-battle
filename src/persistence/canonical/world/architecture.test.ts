// @vitest-environment node
import { expect, it } from 'vitest';
import { preparationMemory } from './preparationCapacity.test-support';
import { loadFloor, loadSpace } from './records';
import { preparationCapacity } from './preparationCapacity';
import { observePositionEvidence } from '../knowledge/observe';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { loadPlacedStairs } from './placedStairs';
import { createWorldFloor } from './generation';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';

it('prepares two open canonical floors, preserves stair bindings, discloses appearance only for seen spaces and stays within allocation', async () => {
  const f = preparationMemory(42);
  await f.floor(1, { spatial: STAIR_LAYOUT_VERSION, architecture: 'open-chambers-v1' });
  await expect(f.read(p => createWorldFloor(p, createModuleRecipe('capacity-world', 2, 43, { spatial: true }))))
    .rejects.toThrow('floor architecture must inherit its established parent');
  await f.floor(2);
  for (const level of [1, 2]) {
    const floor = await f.read(p => loadFloor(p, level)), r = floor.generation.recipe;
    expect(r.architecture).toBe('open-chambers-v1');
    for (let n = 0; n < r.roomBudget; n++) {
      const id = n ? `socket-${n - 1}:room` : 'entry';
      const { value, geometry } = await f.read(p => loadSpace(p, level, id));
      expect(value.spec.furnishing).toBe('none');
      expect(value.schematic).toBe(value.stairwell ? 'stair-room-v1' : 'open-room-v1');
      expect(geometry.cells).toHaveLength(value.spec.rows * value.spec.columns - (value.stairwell ? 3 : 0));
    }
    const observed = await f.read(p => observePositionEvidence(p, { level, cell: floor.entry }));
    expect(observed.spaces.every(s => s.kind === 'passage' || s.furnishing === 'none')).toBe(true);
    expect(observed.spaces.every(s => observed.cells[s.index].at.cell.spaceId === s.spaceId)).toBe(true);
    expect(JSON.stringify(observed)).not.toMatch(/"interior"|"architecture"|"seed"|"purpose"/);
    const { version, roomBudget, policy, spatial, architecture } = r;
    const cap = preparationCapacity({ version, level, roomBudget, policy, spatial, architecture });
    for (const [phase, bound] of Object.entries(cap.phases)) for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
      expect(f.measurements.filter(m => m.level === level && m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
  }
  const upper = await f.read(p => loadFloor(p, 1)), lower = await f.read(p => loadFloor(p, 2));
  const stairRow = [...f.records.values()].find(r => r.key === 'dungeon/1/stairs')!;
  const stairs = await f.read(p => loadPlacedStairs(p, 1, stairRow.value as never));
  expect(stairs.stairs.upper.cell).toEqual(upper.exit);
  expect(stairs.stairs.lower.cell).toEqual(lower.entry);
}, 30_000);

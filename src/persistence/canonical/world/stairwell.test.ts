// @vitest-environment node
import { expect, it } from 'vitest';
import { preparationMemory } from './preparationCapacity.test-support';
import { loadFloor, loadSpace } from './records';
import { loadWorldRoleCompilation } from './roles';
import { loadRoomContent } from '../content/records';
import { observePositionEvidence } from '../knowledge/observe';
import { resolveFloorTravel } from './residency';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { preparationCapacity } from './preparationCapacity';

it.each([1, 42, 1729])('prepares dedicated wells and small chambers with canonical down/up reciprocity, seed %i', async seed => {
  const f = preparationMemory(seed);
  await f.floor(1, { spatial: STAIR_LAYOUT_VERSION, architecture: 'dedicated-stairs-v1' });
  await f.floor(2);
  for (const level of [1, 2]) {
    const floor = await f.read(p => loadFloor(p, level)), recipe = floor.generation.recipe;
    expect(floor.exit!.spaceId).toBe(`socket-${recipe.roomBudget - 2}:room`);
    const plan = (await f.read(p => loadWorldRoleCompilation(p, level))).plan!;
    const ordinaryIds = new Set<string>();
    for (let n = 0; n < recipe.roomBudget; n++) {
      const id = n ? `socket-${n - 1}:room` : 'entry', { value, geometry } = await f.read(p => loadSpace(p, level, id));
      if (value.spec.purpose) {
        expect([value.spec.rows, value.spec.columns]).toEqual([9, 3]);
        expect(geometry.cells).toHaveLength(value.stairwell ? 24 : 27);
        expect(await f.read(p => loadRoomContent(p, level, id))).toMatchObject({ chestId: null, contractId: null });
      } else if (value.spec.kind === 'room') ordinaryIds.add(id);
      const sight = await f.read(p => observePositionEvidence(p, { level, cell: { spaceId: id,
        row: Math.floor(value.spec.rows / 2), column: Math.floor(value.spec.columns / 2) } }));
      expect(sight.cells.length).toBeLessThanOrEqual(113);
      expect(JSON.stringify(sight)).not.toMatch(/"purpose"|"seed"|"architecture"/);
    }
    expect([plan.hubId, ...plan.specialtyIds].every(id => ordinaryIds.has(id))).toBe(true);
    const { version, roomBudget, policy, spatial, architecture } = recipe;
    const capacity = preparationCapacity({ version, level, roomBudget, policy, spatial, architecture });
    for (const [phase, bound] of Object.entries(capacity.phases))
      for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
        expect(f.measurements.filter(m => m.level === level && m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
  }
  const upper = await f.read(p => loadFloor(p, 1)), lower = await f.read(p => loadFloor(p, 2));
  expect(await f.read(p => resolveFloorTravel(p, { level: 1, cell: upper.exit! }, 'down')))
    .toEqual({ kind: 'dungeon', position: { level: 2, cell: lower.entry } });
  expect(await f.read(p => resolveFloorTravel(p, { level: 2, cell: lower.entry }, 'up')))
    .toEqual({ kind: 'dungeon', position: { level: 1, cell: upper.exit! } });
}, 30_000);

it('retains visibility and allocation bounds for a dense 66-node dedicated floor', async () => {
  const f = preparationMemory(73), recipe = await f.floor(1, { roomBudget: 66, spatial: STAIR_LAYOUT_VERSION, architecture: 'dedicated-stairs-v1' });
  for (let n = 0; n < 66; n++) {
    const id = n ? `socket-${n - 1}:room` : 'entry', { value } = await f.read(p => loadSpace(p, 1, id));
    const sight = await f.read(p => observePositionEvidence(p, { level: 1, cell: {
      spaceId: id, row: Math.floor(value.spec.rows / 2), column: Math.floor(value.spec.columns / 2),
    } }));
    expect(sight.spaces.length).toBeLessThanOrEqual(16);
  }
  const { version, level, roomBudget, policy, spatial, architecture } = recipe;
  const capacity = preparationCapacity({ version, level, roomBudget, policy, spatial, architecture });
  for (const [phase, bound] of Object.entries(capacity.phases)) for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
    expect(f.measurements.filter(m => m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
}, 30_000);

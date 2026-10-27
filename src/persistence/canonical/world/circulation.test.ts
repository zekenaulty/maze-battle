// @vitest-environment node
import { expect, it } from 'vitest';
import { preparationMemory } from './preparationCapacity.test-support';
import { loadFloor, loadSpace } from './records';
import { loadWorldRoleCompilation, loadWorldRoomRole } from './roles';
import { loadWorldFloorQuality } from './quality';
import { loadRoomContent } from '../content/records';
import { observePositionEvidence } from '../knowledge/observe';
import { resolveWorldStep } from './residency';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { ModuleAssembly } from '../../../domain/expedition/topology/modules/assembly';
import { moduleChambersInPrefix } from '../../../domain/expedition/topology/modules/intent';
import { preparationCapacity } from './preparationCapacity';
import { opposite } from '../../../domain/maze/movement';
import { assertModuleQuality } from '../../../domain/expedition/topology/modules/quality';

it.each([1, 42, 73])('prepares two canonical circulation floors for seed %i, with chamber-only roles/content and reciprocal steps', async seed => {
  const f = preparationMemory(seed);
  await f.floor(1, { spatial: STAIR_LAYOUT_VERSION, architecture: 'circulation-v1' });
  await f.floor(2);
  for (const level of [1, 2]) {
    const floor = await f.read(p => loadFloor(p, level)), recipe = floor.generation.recipe;
    expect(recipe.architecture).toBe('circulation-v1');
    const roles = await f.read(p => loadWorldRoleCompilation(p, level));
    expect(roles.accumulator.roomCount).toBe(moduleChambersInPrefix(recipe, recipe.roomBudget));
    expect((await f.read(p => loadWorldFloorQuality(p, level))).status).toBe('qualified');
    const assembled = new ModuleAssembly(recipe).finish();
    const destinations = new Set(assembled.spaces.filter(s => s.kind === 'room').map(s => s.id));
    const plan = roles.plan!;
    expect([plan.entryId, plan.exitId, plan.hubId, ...plan.specialtyIds].every(id => destinations.has(id))).toBe(true);
    expect(destinations.has(floor.exit!.spaceId)).toBe(true);
    for (const s of assembled.spaces) {
      const stored = (await f.read(p => loadSpace(p, level, s.id))).value;
      expect(stored.spec).toEqual(s);
      const content = await f.read(p => loadRoomContent(p, level, s.id));
      if (s.kind === 'passage') {
        expect(content.chestId).toBeNull(); expect(content.contractId).toBeNull();
        await expect(f.read(p => loadWorldRoomRole(p, level, s.id))).rejects.toThrow('circulation has no room role');
      }
      const observed = await f.read(p => observePositionEvidence(p, { level, cell: { spaceId: s.id,
        row: Math.floor(s.rows / 2), column: Math.floor(s.columns / 2) } }));
      expect(observed.spaces.find(v => v.spaceId === s.id)!.kind).toBe(s.kind);
      expect(observed.cells.length).toBeLessThanOrEqual(113);
      expect(JSON.stringify(observed)).not.toMatch(/"circulation"|"architecture"|"seed"|"purpose"/);
    }
    for (const link of assembled.connections) {
      expect(await f.read(p => resolveWorldStep(p, { level, cell: link.from }, link.direction)))
        .toEqual({ position: { level, cell: link.to }, moved: true, crossed: true });
      expect(await f.read(p => resolveWorldStep(p, { level, cell: link.to }, opposite(link.direction))))
        .toEqual({ position: { level, cell: link.from }, moved: true, crossed: true });
    }
    const { version, roomBudget, policy, spatial, architecture } = recipe;
    const capacity = preparationCapacity({ version, level, roomBudget, policy, spatial, architecture });
    for (const [phase, bound] of Object.entries(capacity.phases))
      for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
        expect(f.measurements.filter(m => m.level === level && m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
  }
}, 30_000);

it('keeps preparation, role prefixes, source witnesses and visibility bounded on a 66-node floor', async () => {
  const f = preparationMemory(1729);
  const recipe = await f.floor(1, { roomBudget: 66, spatial: STAIR_LAYOUT_VERSION, architecture: 'circulation-v1' });
  const state = new ModuleAssembly(recipe).finish(), expected = assertModuleQuality(state);
  const proof = await f.read(p => loadWorldFloorQuality(p, 1));
  expect(proof.metrics).toEqual({ rooms: 66, reachable: 66, joins: 65, forks: expected.forks, longestChain: expected.longestChain });
  expect((await f.read(p => loadWorldRoleCompilation(p, 1))).accumulator.roomCount).toBe(18);
  for (const s of state.spaces) {
    const sight = await f.read(p => observePositionEvidence(p, { level: 1, cell: {
      spaceId: s.id, row: Math.floor(s.rows / 2), column: Math.floor(s.columns / 2),
    } }));
    expect(sight.cells.length).toBeLessThanOrEqual(113); expect(sight.spaces.length).toBeLessThanOrEqual(16);
  }
  const { version, level, roomBudget, policy, spatial, architecture } = recipe;
  const capacity = preparationCapacity({ version, level, roomBudget, policy, spatial, architecture });
  for (const [phase, bound] of Object.entries(capacity.phases)) for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
    expect(f.measurements.filter(m => m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
}, 30_000);

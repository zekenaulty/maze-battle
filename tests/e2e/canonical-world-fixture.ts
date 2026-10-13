import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { executeCanonical, canonicalFence } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { ModuleAssembly } from '../../src/domain/expedition/topology/modules/assembly';
import { createWorldFloor, expandWorldFloor } from '../../src/persistence/canonical/world/generation';
import { loadFloor, json, required } from '../../src/persistence/canonical/world/records';
import type { SpaceSpec } from '../../src/domain/expedition/types';
import type { ModuleJoin } from '../../src/domain/expedition/topology/modules/types';
import type { TopologyConnection } from '../../src/domain/expedition/topology/types';
import { DEFAULT_WORK_LIMITS, type CanonicalHead, type Json } from '../../src/persistence/canonical/types';
export * from '../../src/persistence/canonical/world/generation';
export * from '../../src/persistence/canonical/world/residency';
export * from '../../src/persistence/canonical/world/records';
export { ModuleAssembly, createModuleRecipe };

export const worldRequest = (head: CanonicalHead, operation: string, input: Json = {}) => ({
  attemptId: crypto.randomUUID(), expected: canonicalFence(head), operation, input, deadlineAt: null,
});
export async function seedWorld(seed = 1, rooms = 8, joins: 'direct' | 'mixed' | 'passage' = 'mixed') {
  const recipe = { ...createModuleRecipe('fixture-world', 1, seed), roomBudget: rooms };
  recipe.policy.joins = joins;
  return initializeCanonical('owner', { position: { level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } } },
    async pages => { await createWorldFloor(pages, recipe); });
}
export async function finishFloor(level = 1) {
  const costs = [];
  for (let step = 0; step < 512; step++) {
    const state = await readCanonical(pages => loadFloor(pages, level));
    if (state.value.exit) return { floor: state.value, costs };
    const request = worldRequest(state.head, 'fixture.expand', { level });
    const result = await executeCanonical(request, async ({ pages }) => json(await expandWorldFloor(pages, level, request.attemptId)));
    costs.push(result.stats);
  }
  throw Error('World fixture expansion budget exhausted');
}
export async function nextFloor(level: number, rooms = 8) {
  const { head } = await readCanonicalHead(), recipe = { ...createModuleRecipe('fixture-world', level, level), roomBudget: rooms };
  await executeCanonical(worldRequest(head, 'fixture.floor', json(recipe)), async ({ pages }) => json(await createWorldFloor(pages, recipe)));
  return finishFloor(level);
}
export async function floorTranscript(level = 1) {
  return readCanonical(async pages => {
    const floor = await loadFloor(pages, level), spaces: SpaceSpec[] = [], joins: ModuleJoin[] = [], connections: TopologyConnection[] = [];
    const readSpace = async (id: string) => (await required<{ spec: SpaceSpec }>(pages, `dungeon/${level}/space/${id}`)).spec;
    spaces.push(await readSpace('entry'));
    for (let n = 0; n < floor.generation.revision; n++) {
      const join = (await required<{ join: ModuleJoin }>(pages, `dungeon/${level}/join/socket-${n}`)).join;
      joins.push(join); spaces.push(await readSpace(join.toRoomId));
      if (join.passageId) spaces.push(await readSpace(join.passageId));
      for (const suffix of join.passageId ? ['entrance', 'exit'] : ['door']) {
        connections.push((await required<{ connection: TopologyConnection }>(pages, `dungeon/${level}/connection/socket-${n}:${suffix}`)).connection);
      }
    }
    return { floor, spaces, joins, connections };
  }, { limits: { ...DEFAULT_WORK_LIMITS, reads: 8192 } });
}

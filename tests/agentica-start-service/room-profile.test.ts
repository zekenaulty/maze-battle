// @vitest-environment node
import { expect, it } from 'vitest';
import { qualityFixture, finishQuality } from '../../src/persistence/canonical/world/quality.test-support';
import { beginWorldRoomRoles, advanceWorldRoomRoles } from '../../src/persistence/canonical/world/roles';
import { beginWorldContent, advanceWorldContent } from '../../src/persistence/canonical/content/preparation';
import { resolveWorldStep } from '../../src/persistence/canonical/world/residency';
import { observePosition } from '../../src/persistence/canonical/knowledge/observe';
import { compareExplorationObservation } from '../../src/persistence/canonical/knowledge/explorationPolicy';
import { sourceReader } from '../../src/persistence/canonical/knowledge/evidence';
import { planScopedApproach } from '../../src/persistence/canonical/navigation/explorationPlan';
import { perceptionFixture } from '../../src/services/agentica/game/observation.test-support';
import { inspectMaze } from '../../src/services/agentica/game/observation';
import { parseFrontier } from '../../src/services/agentica/game/frontierSelection';
import type { CellAddress } from '../../src/services/agentica/game/types';

// Qualification only: normal generated geometry/content and engine sight in memory. No DB, service or planner access.
async function generated(seed: number) {
  const world = qualityFixture(seed, 8); await finishQuality(world);
  let roles = await beginWorldRoomRoles(world.pages, 1);
  while (!roles.plan) roles = await advanceWorldRoomRoles(world.pages, 1);
  let content = await beginWorldContent(world.pages, 1);
  while (content.nextRoom < content.binding.roomCount) content = await advanceWorldContent(world.pages, 1);
  const actor = { level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } };
  const f = await perceptionFixture(await observePosition(world.pages, actor));
  const set = f.knowledge.pages.set.bind(f.knowledge.pages);
  f.knowledge.pages.set = async (area, key, value, indexes = []) => {
    const row = await set(area, key, value, indexes); Object.assign(row, { key, indexes: [...indexes] });
    f.knowledge.records.set(key, structuredClone(row)); return row;
  };
  const page = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers' });
  const candidates = page.data.frontiers as { at: CellAddress; frontier: string }[];
  const selected = candidates.find(c => c.at.level === actor.level && c.at.spaceId === actor.cell.spaceId);
  return { world, actor, f, page, candidates, selected };
}

it('keeps the original seed 2 refusal honest: its first public page offers only foreign spaces', async () => {
  const f = await generated(2);
  expect(f.candidates).toHaveLength(4); expect(f.selected).toBeUndefined();
  expect(f.page.data.next).toEqual(expect.any(String));
});

it('qualifies room-only seed 5 through a public same-space token and four source-validated local moves', async () => {
  const { world, actor, f, candidates, selected } = await generated(5);
  expect(candidates).toHaveLength(4); expect(candidates.indexOf(selected!)).toBe(1);
  expect(candidates[0].at.spaceId).not.toBe(actor.cell.spaceId);
  const selection = parseFrontier(selected!.frontier, f.ref), before = f.knowledge.checkpoint();
  expect(selection.at.cell.spaceId).toBe(actor.cell.spaceId);
  const route = await planScopedApproach(f.knowledge.pages, before, selection.at);
  expect(route).toHaveLength(7);
  const originalWorld = structuredClone([...world.rows]), changes = [];
  for (const step of route!) {
    const checkpoint = f.knowledge.checkpoint(), legal = await resolveWorldStep(world.pages, checkpoint.position, step.direction);
    expect(legal).toMatchObject({ moved: true, crossed: false, position: step.to });
    const cells = await observePosition(world.pages, legal.position);
    const change = await compareExplorationObservation(f.knowledge.pages, checkpoint, cells, actor.cell.spaceId);
    changes.push(change); await f.knowledge.observe(cells);
    if (change) break;
  }
  expect(changes).toHaveLength(4); expect(changes.slice(0, 3)).toEqual([null, null, null]);
  const change = changes[3]!;
  expect(change).toMatchObject({ reason: 'other-space-visible', previousSource: null });
  expect(change.at.cell.spaceId).not.toBe(actor.cell.spaceId);
  const after = f.knowledge.checkpoint();
  expect(after.position.cell.spaceId).toBe(actor.cell.spaceId); expect(after.position).not.toEqual(selection.at);
  expect(after.knowledge!.sequence - before.knowledge!.sequence).toBe(4);
  const observed = await sourceReader(f.knowledge.pages)({ sequence: after.knowledge!.sequence, id: after.knowledge!.id, index: change.index });
  expect(observed.at).toEqual(change.at); expect([...world.rows]).toEqual(originalWorld);
});

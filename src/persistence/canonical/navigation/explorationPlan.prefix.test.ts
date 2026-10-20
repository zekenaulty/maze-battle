// @vitest-environment node
import { expect, it } from 'vitest';
import { opposite } from '../../../domain/maze/movement';
import { blockKey } from '../knowledge/keys';
import { findKnownRoute } from '../knowledge/navigation';
import { readKnowledgeRegion } from '../knowledge/region';
import { localExplorationWindow, planLocalExploration, planScopedApproach } from './explorationPlan';
import { detourCells, detourDirection, earnedDetour } from './explorationPlan.prefix.test-support';
import { RETAINED_ROUTE_STEPS } from './types';

it('selects an earned 89-step detour without mistaking a truncated route for unreachable', async () => {
  const { f, cells } = await earnedDetour(), before = structuredClone(f.records);
  const window = (await localExplorationWindow(f.pages, f.checkpoint()))!;
  const region = await readKnowledgeRegion(f.pages, f.checkpoint(), window);
  const route = findKnownRoute(region, cells[0].at, cells.at(-1)!.world)!;
  expect(route.complete).toBe(false); expect(route.steps).toHaveLength(64);
  expect(region.cells.filter(c => c.state === 'remembered')).toHaveLength(89);
  const plan = await planLocalExploration(f.pages, f.checkpoint(), 'room');
  expect(plan?.target).toEqual(cells.at(-1)!.at); expect(plan?.window).toEqual(window);
  expect(plan?.route).toEqual(route.steps.slice(0, RETAINED_ROUTE_STEPS).map(({ direction, to }) => ({ direction, to })));
  expect(f.records).toEqual(before);
  expect(f.reads.every(key => key.startsWith('perception/'))).toBe(true);
});

it('ranks 69- and 89-step boundaries by full earned distance, not their equal capped prefixes', async () => {
  const cells = detourCells(); delete cells[69].edges.east;
  const { f } = await earnedDetour(cells);
  // The farther boundary sorts first by coordinates, so a capped-distance tie is wrong.
  expect(cells[89].world.row).toBeLessThan(cells[69].world.row);
  expect((await planLocalExploration(f.pages, f.checkpoint(), 'room'))?.target).toEqual(cells[69].at);
});

it('refills the retained target/window after serialized knowledge reload without oscillation', async () => {
  const seeded = await earnedDetour(), { cells } = seeded;
  let f = seeded.f;
  const target = cells.at(-1)!.at, window = (await localExplorationWindow(f.pages, f.checkpoint()))!;
  const visited = [cells[0].at]; let moved = 0;
  while (moved < cells.length - 1) {
    const route = await planScopedApproach(f.pages, f.checkpoint(), target, structuredClone(window));
    expect(route?.length).toBeGreaterThan(0); expect(route!.length).toBeLessThanOrEqual(RETAINED_ROUTE_STEPS);
    for (const step of route!) {
      moved++; expect(step.to).toEqual(cells[moved].at); visited.push(step.to);
      await f.observe([{ ...cells[moved], edges: {} }]);
    }
    f = f.snapshot();
  }
  expect(moved).toBe(89); expect(f.checkpoint().position).toEqual(target);
  expect(new Set(visited.map(at => JSON.stringify(at))).size).toBe(90);
});

it('still refuses a disconnected earned destination rather than treating any prefix as reachable', async () => {
  const cells = detourCells(), direction = detourDirection(cells[43], cells[44]);
  cells[43].edges[direction] = null; cells[44].edges[opposite(direction)] = null;
  const { f } = await earnedDetour(cells), before = structuredClone(f.records);
  expect(await planLocalExploration(f.pages, f.checkpoint(), 'room')).toBeNull();
  expect(await planScopedApproach(f.pages, f.checkpoint(), cells.at(-1)!.at)).toBeNull();
  expect(f.records).toEqual(before);
});

it('does not convert missing route evidence into an empty coverage result', async () => {
  const { f, cells } = await earnedDetour(); f.records.delete(blockKey(cells[44].at));
  await expect(planScopedApproach(f.pages, f.checkpoint(), cells.at(-1)!.at)).rejects.toThrow();
});

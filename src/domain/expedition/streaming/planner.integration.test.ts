// @vitest-environment node
import { expect, it } from 'vitest';
import { opposite } from '../../maze/movement';
import { sameAddress } from '../address';
import { StreamPlanner } from './planner';
import { StreamHarness } from './testSupport';

// Only the test oracle owns world maps. No harness or room is passed to the planner.
function observedPage(world: StreamHarness) {
  return structuredClone(world.pages.get(world.checkpoint.position.spaceId)!);
}

it.each([{ seed: 1, pending: false }, { seed: 55, pending: true }, { seed: 20261008, pending: true }])(
  'explores, prepares, collects and returns through real v2 commands with reloads (seed $seed)', async ({ seed, pending }) => {
  const world = new StreamHarness(seed, 2);
  let planner = new StreamPlanner();
  let epoch = 0;
  let reusedSteps = 0;
  let crossings = 0;
  let preparations = 0;
  let pendingPreparations = 0;
  for (let step = 0; step < 8000 && world.checkpoint.phase !== 'complete'; step++) {
    if (step > 0 && step % 47 === 0) {
      reusedSteps += planner.diagnostics.work.reusedSteps;
      planner = new StreamPlanner();
      epoch++;
    }
    const before = structuredClone(world.checkpoint);
    const decision = planner.choose(before, observedPage(world), { sessionId: 'observed-runtime', epoch });
    expect(decision.command, `revision ${before.revision}: ${decision.reason}`).toBeDefined();
    const transition = await world.step(decision.command!);
    expect(transition.applied, `${decision.command!.type}: ${transition.reason}`).toBe(true);
    const after = world.checkpoint;
    expect(planner.diagnostics.cache.cells).toBeLessThanOrEqual(512);
    const maxPorts = world.topology.space(before.position.spaceId)!.spec.kind === 'passage' ? 2 : 4;
    expect(planner.diagnostics.cache.ports).toBeLessThanOrEqual(maxPorts);
    expect(planner.diagnostics.cache.pages).toBe(1);
    expect(planner.diagnostics.cache.batchSteps).toBeLessThanOrEqual(128);
    expect(planner.diagnostics.lastWork.expandedCells).toBeLessThanOrEqual(8 * 512);
    if (decision.command!.type === 'prepare') {
      preparations++;
      expect(after.position).toEqual(before.position);
      expect(after.moves).toBe(before.moves);
      expect(after.revision).toBe(before.revision + 1);
      if (observedPage(world).frontiers[decision.command!.frontierId]) {
        pendingPreparations++;
        expect(after.topologyRevision).toBe(before.topologyRevision + 1);
      }
    }
    if (before.position.spaceId !== after.position.spaceId) {
      crossings++;
      expect(transition.pages).toHaveLength(2);
      const source = transition.pages.find(page => page.spaceId === before.position.spaceId)!;
      const target = observedPage(world);
      expect(Object.values(source.openings).some(port => sameAddress(port, before.position)
        && port.destination && sameAddress(port.destination, after.position))).toBe(true);
      expect(Object.values(target.openings).some(port => sameAddress(port, after.position)
        && port.destination && sameAddress(port.destination, before.position))).toBe(true);
    }
  }
  reusedSteps += planner.diagnostics.work.reusedSteps;
  const checkpoint = world.checkpoint;
  const header = world.topology.header();
  expect(checkpoint.phase).toBe('complete');
  expect(checkpoint.position).toEqual(checkpoint.home);
  expect(checkpoint.visitedSpaces).toBe(header.rooms * 2 - 1);
  expect(checkpoint.clearedSpaces).toBe(checkpoint.visitedSpaces);
  expect(checkpoint.collectedChests).toBe(header.rooms - 1);
  expect(preparations).toBeGreaterThan(0);
  expect(pendingPreparations > 0).toBe(pending);
  expect(crossings).toBe(2 * (checkpoint.visitedSpaces - 1));
  expect(reusedSteps).toBeGreaterThan(20);
});

it('revisits an unfinished child after a manual early return and planner reload', async () => {
  const world = new StreamHarness(55);
  const planner = new StreamPlanner();
  for (let step = 0; step < 500; step++) {
    const before = structuredClone(world.checkpoint);
    const decision = planner.choose(before, observedPage(world), { sessionId: 'original', epoch: 0 });
    expect(decision.command, decision.reason).toBeDefined();
    expect((await world.step(decision.command!)).applied).toBe(true);
    if (before.position.spaceId === world.checkpoint.position.spaceId) continue;
    expect(observedPage(world).cleared).toBe(false);
    if (decision.command!.type !== 'move') throw new Error('Crossing was not a move');
    const direction = decision.command!.direction;
    expect((await world.step({ type: 'move', direction: opposite(direction) })).applied).toBe(true);
    expect(world.checkpoint.position).toEqual(before.position);
    expect(observedPage(world).completedExits).toEqual([]);
    const reloaded = new StreamPlanner();
    expect(reloaded.choose(structuredClone(world.checkpoint), observedPage(world), { sessionId: 'replacement', epoch: 1 }).command)
      .toEqual({ type: 'move', direction });
    return;
  }
  throw new Error('No child crossing within the bounded fixture.');
});

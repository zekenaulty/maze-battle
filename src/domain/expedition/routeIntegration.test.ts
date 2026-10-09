import { expect, it } from 'vitest';
import { applyExpeditionCommand, createExpeditionCheckpoint } from './commands';
import { createExpeditionPlan, materializeSpace } from './generation';
import { ObservedRoutePlanner } from './routePlanner';
import type { RouteKnowledgeChanges } from './routeKnowledge';
import { SpaceResidency } from './residency';

it.each([1, 55, 20261008])('completes the real expedition with exhaustive host change sets (seed %i)', seed => {
  const plan = createExpeditionPlan({ version: 'spaces-v1', worldId: 'routing', floorId: 'one', seed, level: 1 });
  const cache = new SpaceResidency(512, materializeSpace);
  const read = cache.get.bind(cache);
  let checkpoint = createExpeditionCheckpoint(plan, read);
  let changes: RouteKnowledgeChanges | undefined;
  const planner = new ObservedRoutePlanner();
  for (let step = 0; step < 4000 && checkpoint.phase !== 'complete'; step++) {
    const decision = planner.choose(checkpoint, { sessionId: 'test', epoch: 0, changes });
    expect(decision.command, decision.reason).toBeDefined();
    const result = applyExpeditionCommand(plan, checkpoint, decision.command!, read);
    expect(result.applied, result.reason).toBe(true);
    expect(result.changes?.fromRevision).toBe(checkpoint.revision);
    for (const kind of ['cells', 'openings', 'chests'] as const) {
      const keys = new Set([...Object.keys(checkpoint.knowledge[kind]), ...Object.keys(result.checkpoint.knowledge[kind])]);
      for (const key of keys) {
        if (JSON.stringify(checkpoint.knowledge[kind][key]) !== JSON.stringify(result.checkpoint.knowledge[kind][key])) {
          expect(result.changes![kind], `Missing ${kind} delta ${key}`).toContain(key);
        }
      }
    }
    checkpoint = result.checkpoint;
    changes = result.changes;
  }
  expect(checkpoint.phase).toBe('complete');
  expect(checkpoint.position).toEqual(checkpoint.home);
  expect(checkpoint.openedChestIds).toHaveLength(plan.spaces.flatMap(space => space.chests).length);
  expect(planner.diagnostics.work.fullAudits).toBe(1);
  expect(planner.diagnostics.work.reusedSteps).toBeGreaterThan(20);
  expect(cache.stats().residentCells).toBeLessThanOrEqual(512);
});

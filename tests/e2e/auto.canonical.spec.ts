import { test, expect } from '@playwright/test';
import type {} from './canonical-auto.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
});

test('native Auto accepts, explores, collects, claims, backtracks and stops honestly for combat', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = window.canonicalAuto; await a.seed();
    const actions: string[] = [], rooms = new Set<string>(), targets = new Set<string>(), costs = [];
    for (let tick = 0; tick < 1000; tick++) {
      const action = await a.act(), value = (await a.read()).value;
      costs.push(action.outcome.stats); rooms.add(value.checkpoint.position.cell.spaceId);
      if (value.state?.objective) targets.add(value.state.objective.id);
      const result = action.outcome.receipt.result;
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const child = result.action;
        if (child && typeof child === 'object' && !Array.isArray(child)) actions.push(String(child.kind));
        if (result.outcome === 'blocked') return { ticks: tick + 1, state: value, actions, rooms: rooms.size, targets: targets.size, costs };
      }
    }
    throw Error('Auto exceeded qualification step budget');
  });
  expect(result.state.state?.reason).toContain('combat-required');
  expect(result.state.checkpoint.mode).toBe('manual');
  expect(result.state.state?.completed).toBe(true);
  expect(result.rooms).toBeGreaterThan(8);
  expect(result.targets).toBeGreaterThan(0);
  for (const kind of ['accept-quest', 'move', 'open-chest', 'claim-quest']) expect(result.actions).toContain(kind);
  expect(result.actions).not.toContain('stairs');
  console.info('CANONICAL_AUTO', JSON.stringify({ ticks: result.ticks, rooms: result.rooms, actions: result.actions.length,
    maxReads: Math.max(...result.costs.map(c => c.reads)), maxWrites: Math.max(...result.costs.map(c => c.writes)), maxWriteBytes: Math.max(...result.costs.map(c => c.writeBytes)) }));
});

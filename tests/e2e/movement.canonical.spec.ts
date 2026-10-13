import { test, expect } from '@playwright/test';
import type {} from './canonical-town-party.fixture';
import type { CanonicalSnapshot } from '../../src/persistence/canonical/types';
import type { GridPosition } from '../../src/domain/types';

test('earned snapshot routes drive canonical moves, persist, and never take incidental stairs', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-town-party.fixture.html');
  await page.waitForFunction(() => !!window.townParty);
  const result = await page.evaluate(async () => {
    const c = window.townParty, n = c.navigation, k = c.knowledge;
    await k.seed();
    const current = await k.current(), snapshot = current.snapshot, start = current.value.cells[0];
    const scope = n.navigationScope(start.at.level, start.world, start.world)!;
    const region = (await c.readCanonicalRegion(snapshot, scope)).value;
    const goal = region.cells.find(({ cell }) => (n.findKnownRoute(region, start.at, cell.world)?.steps.length ?? 0) >= 3)?.cell;
    if (!goal) throw Error('Fixture must earn a three-step route');
    const target = { ...goal.world }, routing = n.readNavigationRoute(snapshot, start.world, target);
    target.row += 1000;
    const route = await routing;
    if (!route?.complete) throw Error('Missing earned route');
    const before = (await c.readCanonicalHead()).head;
    const unknown = await n.readNavigationRoute(snapshot, start.world, { row: start.world.row + 50, column: start.world.column });
    const abort = new AbortController(); abort.abort();
    let aborted = false;
    try { await n.readNavigationRoute(snapshot, start.world, goal.world, abort.signal); } catch { aborted = true; }
    const afterReads = (await c.readCanonicalHead()).head;
    const receipts = [];
    for (const step of route.steps) receipts.push((await k.act({ kind: 'move', direction: step.direction, triggerStairs: false })).outcome.receipt);
    const arrived = (await c.readCanonicalHead()).head;
    const back = await n.readNavigationRoute((await c.readCanonicalHead()).snapshot, goal.world, start.world);
    if (!back?.complete) throw Error('Missing earned return route');
    for (const step of back.steps) await k.act({ kind: 'move', direction: step.direction, triggerStairs: false });
    const returned = c.roster.gameCheckpoint((await c.readCanonicalHead()).head.checkpoint);
    return { snapshot, start, goal, route, receipts, arrived, returned, unknown, aborted, readsUnchanged: JSON.stringify(before) === JSON.stringify(afterReads) };
  });
  expect(result.unknown).toBeNull(); expect(result.aborted).toBe(true); expect(result.readsUnchanged).toBe(true);
  expect(result.route.steps.length).toBeGreaterThanOrEqual(3);
  expect(result.route.steps.at(-1)?.to).toEqual(result.goal.at);
  for (const receipt of result.receipts) expect(receipt.result).toMatchObject({ kind: 'move', moved: true, needsFloor: null, mode: 'manual' });
  expect(result.arrived.checkpoint).toMatchObject({ position: result.goal.at, mode: 'manual' });
  expect(result.start.stairs).toContain('town');
  expect(result.returned).toMatchObject({ position: result.start.at, mode: 'manual' });
  await page.reload(); await page.waitForFunction(() => !!window.townParty);
  const reloaded = await page.evaluate(async encoded => {
    const { snapshot, start, goal }: { snapshot: CanonicalSnapshot; start: GridPosition; goal: GridPosition } = JSON.parse(encoded);
    return window.townParty.navigation.readNavigationRoute(snapshot, start, goal);
  }, JSON.stringify({ snapshot: result.snapshot, start: result.start.world, goal: result.goal.world }));
  expect(reloaded).toEqual(result.route);
});

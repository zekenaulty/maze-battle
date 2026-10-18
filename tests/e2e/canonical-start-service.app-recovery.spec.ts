import { test, expect, serviceProof } from './canonical-start-service.decision.test';

test('actual App recovers original navigation and root through real HTTP at quota without a planner or game effect', async ({ page, wire }, info) => {
  await page.evaluate(() => window.canonicalStartService.startScript());
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readScript())).messages
    .some(message => message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  const script = await page.evaluate(() => window.canonicalStartService.readScript()), counters = await serviceProof();
  expect(script.results).toHaveLength(4); expect(script.results[3].operation).toBeDefined();
  const sent = wire.sent.length;
  // Real page replacement mounts the real App, with a new hook-owned GameSession.
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('canvas[aria-label="Dungeon map"]')).toBeVisible();
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Vite dev-only module URL; no production fixture import.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
  const quota = await page.evaluate(() => window.canonicalStartService.fillQuota());
  expect(quota.view.recoveryRequired).toBe(true); expect(quota.view.controlled).toBe(false);
  const before = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  const http = wire.http.length;
  await page.getByRole('button', { name: 'Reset and start new game', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Reset Maze Battle?' });
  await reset.getByRole('button', { name: 'Discard saves and start new game', exact: true }).click();
  await expect(reset.getByRole('alert')).toContainText('reset blocked by unresolved verified-host obligation');
  expect((await page.evaluate(() => window.canonicalStartService.snapshot())).head).toEqual(quota.head);
  await reset.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Agentica recovery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentica recovery' });
  await page.getByRole('button', { name: 'Inspect original 1' }).click();
  expect(wire.http).toHaveLength(http); expect(wire.sent.slice(sent)).toEqual([]);
  await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(script.actions[3].actionId);
  await page.getByRole('button', { name: 'Stop navigation', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Navigation stopped' })).toBeVisible();
  const cancelled = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(cancelled.head.allocations).toHaveProperty(script.results[3].operation!.operationId);
  expect(cancelled.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(wire.http).toHaveLength(http);
  await page.getByRole('button', { name: 'Inspect original 1' }).click();
  await page.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Navigation acknowledged' })).toBeVisible();
  const acknowledged = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(acknowledged.head.allocations).not.toHaveProperty(script.results[3].operation!.operationId);
  expect(acknowledged.head.allocations).toHaveProperty(acknowledged.launch!.guard.id);
  await page.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  const final = await page.evaluate(() => window.canonicalStartService.snapshot());
  const after = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  expect(final.head.allocations).toEqual({}); expect(final.head.checkpoint).toEqual(quota.head.checkpoint);
  expect(final.launch!.guard.state).toBe('acknowledged');
  expect(after.effects).toEqual(before.effects); expect(after.publications).toEqual(before.publications);
  expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sent)).toEqual([]);
  expect(wire.http.slice(http).filter(item => item.method === 'POST').map(item => new URL(item.url).pathname))
    .toEqual(['/api/operations/events', '/api/starts/stop']);
  await expect(dialog.getByText('Session clearance', { exact: true }).locator('..')).toContainText('Unknown');
  await page.screenshot({ path: info.outputPath('actual-app-remote-cleanup-mobile.png') });
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Reset and start new game', exact: true }).click();
  await reset.getByRole('button', { name: 'Discard saves and start new game', exact: true }).click();
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const fresh = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(fresh.head.gameId).not.toBe(final.head.gameId); expect(fresh.head.generation).not.toBe(final.head.generation);
  expect(fresh.launch).toBeNull(); expect(fresh.head.allocations).toEqual({});
  expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sent)).toEqual([]);
  await info.attach('actual-app-remote-cleanup.json', { body: JSON.stringify({ quota, cancelled, acknowledged, final,
    fresh, before, after, counters, http: wire.http.slice(http) }, null, 2), contentType: 'application/json' });
});

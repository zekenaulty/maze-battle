import { test, expect, service, serviceProof } from './canonical-start-service.decision.test';
import { retainPendingSuccessor } from './canonical-start-service.pending.steps';
import { waitPendingRunTerminal } from './canonical-start-service.pending-run';
import { canonicalEvidence, recoveryEnvelope } from './canonical-start-service.pending-recovery.steps';
import type { Page } from '@playwright/test';

async function attachActualApp(page: Page) {
  await page.evaluate(async () => {
    // @ts-expect-error Dev-only instrumentation reuses the actual hook-owned writer, including failure recovery.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
}
async function openRecovery(page: Page) {
  await page.getByRole('button', { name: 'Agentica recovery', exact: true })
    .or(page.getByRole('button', { name: 'Agentic play', exact: true })).click();
  await page.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
}

test('actual App rediscovers a lost accepted action after both ACKs, page reload and service restart', async ({ page, wire }, info) => {
  const setup = await retainPendingSuccessor(page, wire, info), sent = wire.sent.length;
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible(); await attachActualApp(page);
  const quota = await page.evaluate(() => window.canonicalStartService.fillQuota()); expect(quota.view.recoveryRequired).toBe(true);
  const http = wire.http.length;
  await openRecovery(page); expect(wire.http).toHaveLength(http);
  const dialog = page.getByRole('dialog', { name: 'Agentica recovery' });
  await page.getByRole('button', { name: 'Stop navigation', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Navigation stopped' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'service Stop is pending' })).toBeVisible();
  await waitPendingRunTerminal(setup.action);
  await page.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await page.getByRole('button', { name: 'Check action custody', exact: true }).click();
  await page.getByRole('button', { name: `Inspect action ${setup.action.actionId}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected pending action' })).toContainText('maze.inspect');
  await page.getByRole('button', { name: 'Reconcile pending action', exact: true }).scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('pending-action-selected-mobile.png') });
  const before = await canonicalEvidence(page);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (new URL(String(input)).pathname === '/api/recovery' && init?.method === 'POST' && response.ok) {
        window.fetch = original;
        Reflect.set(globalThis, '__lostRecovery', { body: init.body, response: await response.clone().json() });
        throw Error('Fixture discarded the real accepted action-recovery reply.');
      }
      return response;
    };
  });
  await page.getByRole('button', { name: 'Reconcile pending action', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('discarded the real accepted');
  const lost = await page.evaluate(() => Reflect.get(globalThis, '__lostRecovery'));
  const original = recoveryEnvelope(wire, setup.action);
  expect(lost).toEqual({ body: original.serialized, response: { actionId: setup.action.actionId, resolved: true, duplicate: false } });
  expect(await canonicalEvidence(page)).toEqual(before);
  // Both acknowledgements may release allocations; neither may erase the claimed-run locator.
  await page.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await page.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Navigation acknowledged' })).toBeVisible();
  const acknowledged = await page.evaluate(() => window.canonicalStartService.snapshot()); expect(acknowledged.head.allocations).toEqual({});
  const restarted = await service.restart(); expect(restarted.processId).not.toBe(setup.counters.processId);
  await page.reload();
  // Both ACKs released their allocations; wait for boot to settle, not its transient recovery view.
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachActualApp(page); await openRecovery(page);
  const afterReload = await canonicalEvidence(page);
  const reads = wire.http.length;
  await page.getByRole('button', { name: 'Check action custody', exact: true }).click();
  await page.getByRole('button', { name: `Inspect action ${setup.action.actionId}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected pending action' })).toContainText('maze.inspect');
  expect(wire.http.slice(reads).map(row => row.method)).toEqual(['GET', 'GET']);
  expect(wire.http.slice(reads).map(row => new URL(row.url).pathname)).toEqual(['/api/recovery/run', '/api/recovery/action']);
  await page.getByRole('button', { name: 'Reconcile pending action', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Action reconciled as unavailable' })).toBeVisible();
  expect(recoveryEnvelope(wire, setup.action).serialized).toBe(original.serialized);
  expect(await canonicalEvidence(page)).toEqual(afterReload);
  expect(afterReload.effects).toEqual(setup.canonical.effects); expect(afterReload.publications).toEqual(setup.canonical.publications);
  expect(await serviceProof()).toEqual(restarted); expect(wire.sent.slice(sent)).toEqual([]);
  expect(wire.http.filter(row => row.method === 'POST' && new URL(row.url).pathname === '/api/recovery')).toHaveLength(2);
  await expect(dialog.getByText('Session clearance', { exact: true }).locator('..')).toContainText('Unknown');
  await page.screenshot({ path: info.outputPath('pending-recovery-after-reload-mobile.png') });
  await info.attach('actual-app-pending-recovery.json', { body: JSON.stringify({ lost, original, before, acknowledged, afterReload,
    restarted, requests: wire.http.slice(http) }, null, 2), contentType: 'application/json' });
});

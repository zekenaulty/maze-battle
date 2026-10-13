import { expect, test } from '@playwright/test';
import type * as Fixture from './canonical-game-host-cleanup.fixture';
declare global { interface Window { cleanupFixture: typeof Fixture } }
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/canonical-game-host.html'); await page.waitForFunction(() => !!window.cleanupFixture);
});
test('same-owner normal quota failure still permits funded cancel, exact retry and ACK without resuming play', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.fundedCleanup());
  expect(result.failure).toContain('quota exhausted');
  expect(result.failedView).toMatchObject({ controlled: false, recoveryRequired: true });
  expect(result.status).toEqual(result.failedView); expect(result.same).toBe(true);
  expect(result.operation?.state).toBe('acknowledged');
  expect(result.quota.reservations).toBe(0); expect(result.quota.reservedBytes).toBe(0);
});
test('failed native cleanup exposes its exact request for reconciliation instead of creating a replacement', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.ambiguousCleanup());
  expect(result.receipt.attemptId).toBe(result.original.attemptId);
  expect(result.op?.terminal?.attemptId).toBe(result.original.attemptId);
});
test('takeover that commits before quota-blocked resume retains same-owner funded cleanup', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.cleanupAfterFailedResume());
  expect(result.error).toContain('quota exhausted'); expect(result.sameOwner).toBe(true);
  expect(result.beforeStatus).toBe('stopped'); expect(result.afterStatus).toBe('stopped');
  expect(result.final).toEqual(result.state); expect(result.final.controlled).toBe(false);
});
test('a presence lock cannot authorize cleanup of another owner\'s operation', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.foreignOwner());
  expect(result.error).toContain('cleanup custody changed'); expect(result.unchanged).toBe(true);
});
test('reset invalidates queued cleanup and prevents reuse of its operation in a new generation', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.resetInvalidation());
  expect(result.results).toEqual(['rejected', 'fulfilled']);
  expect(result.failure).toContain('cleanup custody changed'); expect(result.replaced).toBe(true); expect(result.allocations).toEqual({});
});

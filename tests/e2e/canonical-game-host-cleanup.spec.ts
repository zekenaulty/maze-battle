import { expect, test } from '@playwright/test';
import type * as Fixture from './canonical-game-host-cleanup.fixture';
import { HEAD_CAPACITY_BYTES } from '../../src/persistence/canonical/privateCapacity';
import type { CanonicalHead } from '../../src/persistence/canonical/types';
declare global { interface Window { cleanupFixture: typeof Fixture } }
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/canonical-game-host.html'); await page.waitForFunction(() => !!window.cleanupFixture);
});
function assertQuotaBoundary({ before, after, actualStoredBytes }: {
  before: CanonicalHead; after: CanonicalHead; actualStoredBytes: number;
}) {
  const q = after.quota, policy = q.privateCapacity;
  if (!policy) throw Error('Expected private capacity');
  const charge = actualStoredBytes - Buffer.byteLength(JSON.stringify(['heads', after.gameId, after]))
    + policy.allocatedBytes - policy.consumedBytes + HEAD_CAPACITY_BYTES;
  expect(q.limitBytes - q.reserveBytes - q.reservedBytes - charge).toBe(16);
  expect(q.usedBytes).toBe(actualStoredBytes); expect(policy.allocatedBytes).toBeGreaterThan(0);
  expect(after).toEqual({ ...before, quota: { ...before.quota, usedBytes: q.usedBytes, limitBytes: q.limitBytes } });
  expect(q.reservations).toBe(1); expect(q.reservedBytes).toBeGreaterThan(0);
}

test('same-owner normal quota failure still permits funded cancel, exact retry and ACK without resuming play', async ({ page }, info) => {
  const result = await page.evaluate(() => window.cleanupFixture.fundedCleanup());
  await info.attach('quota-boundary.json', { body: JSON.stringify(result), contentType: 'application/json' });
  assertQuotaBoundary(result.quotaBoundary); expect(result.failureUnchanged).toBe(true);
  expect(result.failure).toContain('quota exhausted');
  expect(result.failedView).toMatchObject({ controlled: false, recoveryRequired: true });
  expect(result.status).toEqual(result.failedView); expect(result.same).toBe(true);
  expect(result.operation?.state).toBe('acknowledged');
  expect(result.quota.reservations).toBe(0); expect(result.quota.reservedBytes).toBe(0);
  expect(result.quota.usedBytes).toBe(result.actualStoredBytes);
  expect(result.quota.limitBytes).toBe(result.quotaBoundary.after.quota.limitBytes);
  expect(result.quota.privateCapacity).toEqual(result.quotaBoundary.before.quota.privateCapacity);
  expect(result.finalHead.roots).toEqual(result.quotaBoundary.before.roots);
  expect(result.finalHead.checkpoint).toEqual(result.quotaBoundary.before.checkpoint);
});
test('failed native cleanup exposes its exact request for reconciliation instead of creating a replacement', async ({ page }) => {
  const result = await page.evaluate(() => window.cleanupFixture.ambiguousCleanup());
  expect(result.receipt.attemptId).toBe(result.original.attemptId);
  expect(result.op?.terminal?.attemptId).toBe(result.original.attemptId);
});
test('takeover that commits before quota-blocked resume retains same-owner funded cleanup', async ({ page }, info) => {
  const result = await page.evaluate(() => window.cleanupFixture.cleanupAfterFailedResume());
  await info.attach('quota-boundary.json', { body: JSON.stringify(result), contentType: 'application/json' });
  assertQuotaBoundary(result.quotaBoundary);
  expect(result.error).toContain('quota exhausted'); expect(result.sameOwner).toBe(true);
  expect(result.beforeStatus).toBe('stopped'); expect(result.afterStatus).toBe('stopped');
  expect(result.final).toEqual(result.state); expect(result.final.controlled).toBe(false);
  expect(result.finalHead.quota.usedBytes).toBe(result.actualStoredBytes);
  expect(result.finalHead.quota.limitBytes).toBe(result.quotaBoundary.after.quota.limitBytes);
  expect(result.finalHead.quota.privateCapacity).toEqual(result.quotaBoundary.before.quota.privateCapacity);
  expect(result.finalHead.roots).toEqual(result.quotaBoundary.before.roots);
  expect(result.finalHead.checkpoint).toEqual(result.quotaBoundary.before.checkpoint);
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

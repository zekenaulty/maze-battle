import { expect, test } from '@playwright/test';
import type {} from './custody-recovery.fixture';
import { HEAD_CAPACITY_BYTES } from '../../src/persistence/canonical/privateCapacity';
import { MIN_RECOVERY_BYTES } from '../../src/persistence/canonical/types';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5242' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/custody-recovery.html');
  await page.waitForFunction(() => !!window.custodyRecovery);
});

test.afterEach(async ({ page }, info) => {
  const boundaries = await page.evaluate(async () => {
    const path = '/tests/e2e/custody-recovery.support.ts';
    const support: typeof import('./custody-recovery.support') = await import(/* @vite-ignore */ path);
    return support.quotaBoundaries;
  });
  if (info.title.startsWith('recovery claim cannot enter ready state')) { expect(boundaries).toEqual([]); return; }
  await info.attach('quota-boundary.json', { body: JSON.stringify(boundaries), contentType: 'application/json' });
  expect(boundaries).toHaveLength(1);
  const { before, after, actualStoredBytes } = boundaries[0], q = after.quota, policy = q.privateCapacity;
  if (!policy) throw Error('Expected private capacity');
  const charge = actualStoredBytes - Buffer.byteLength(JSON.stringify(['heads', after.gameId, after]))
    + policy.allocatedBytes - policy.consumedBytes + HEAD_CAPACITY_BYTES;
  expect(q.limitBytes - q.reserveBytes - q.reservedBytes - charge).toBe(32);
  expect(q.usedBytes).toBe(actualStoredBytes); expect(q.reserveBytes).toBe(MIN_RECOVERY_BYTES);
  expect(after).toEqual({ ...before, quota: { ...before.quota, usedBytes: q.usedBytes, limitBytes: q.limitBytes, reserveBytes: MIN_RECOVERY_BYTES } });
  if (info.title.startsWith('new GameSession')) expect(policy.allocatedBytes).toBeGreaterThan(0);
  else expect(policy.allocatedBytes).toBe(0);
});

test('explicit stopped foreign claim protects all 16 funded originals without adoption or resume', async ({ page }) => {
  const r = await page.evaluate(() => window.custodyRecovery.funded());
  expect(r.normal).toContain('storage quota exhausted'); expect(r.normalUnchanged).toBe(true);
  expect(r.claimed.status).toBe('stopped'); expect(r.claimed.epoch).toBe(r.stopped.epoch + 1);
  expect(r.claimed.owner).not.toBe(r.stopped.owner); expect(r.claimed.revision).toBe(r.stopped.revision + 1);
  expect(r.claimed.roots).toEqual(r.stopped.roots); expect(r.claimed.checkpoint).toEqual(r.stopped.checkpoint);
  expect(r.claimed.allocations).toEqual(r.stopped.allocations); expect(r.claimed.quota.reservedBytes).toBe(r.stopped.quota.reservedBytes);
  expect(r.claimed.quota.reservations).toBe(16); expect(r.originalsUnadopted).toBe(true);
  expect(r.ordinary).toContain('stopped'); expect(r.adopt).toContain('stopped'); expect(r.effects).toBe(0);
  expect(r.resume).toContain('storage quota exhausted'); expect(r.failedWritesUnchanged).toBe(true);
  expect(r.wrongAck).toContain('phase changed'); expect(r.wrongTerminal).toContain('terminal acknowledgement changed');
  expect(r.exact).toBe(true); expect(r.accounted).toBe(true);
  expect(r.operations).toHaveLength(16);
  expect(r.operations.every(op => op.state === 'acknowledged' && op.disposition === 'cancelled' && op.owner === r.claimed.owner)).toBe(true);
  expect(r.head.status).toBe('stopped'); expect(r.head.roots).toEqual(r.stopped.roots); expect(r.head.checkpoint).toEqual(r.stopped.checkpoint);
  expect(r.head.allocations).toEqual({}); expect(r.head.quota.reservedBytes).toBe(0); expect(r.head.quota.reservations).toBe(0);
});

test('repeated explicit claims exhaust only global headroom, leaving all 16 cancel/ACK reservations usable', async ({ page }) => {
  const r = await page.evaluate(() => window.custodyRecovery.exhausted());
  expect(r.count).toBeGreaterThan(1); expect(r.count).toBeLessThan(256); expect(r.error).toContain('storage quota exhausted');
  expect(r.unchanged).toBe(true); expect(r.exhausted.quota.reservedBytes).toBe(r.stopped.quota.reservedBytes);
  expect(r.exhausted.allocations).toEqual(r.stopped.allocations); expect(r.exhausted.quota.reservations).toBe(16);
  expect(r.exhausted.quota.usedBytes + r.exhausted.quota.reservedBytes).toBeLessThanOrEqual(r.exhausted.quota.limitBytes);
  expect(r.exact).toBe(true); expect(r.accounted).toBe(true);
  expect(r.operations).toHaveLength(16); expect(r.operations.every(op => op.state === 'acknowledged' && op.disposition === 'cancelled')).toBe(true);
  expect(r.head.quota.reservations).toBe(0); expect(r.head.status).toBe('stopped'); expect(r.head.roots).toEqual(r.stopped.roots);
});

test('owned claim input, exact expired replay, stale custody and reset fencing', async ({ page }) => {
  const r = await page.evaluate(() => window.custodyRecovery.replayAndFences());
  expect(r.claimedOwner).toBe('owner-1'.padEnd(128, 'o'));
  expect(r.replayed).toBe(true); expect(r.sameReceipt).toBe(true); expect(r.replayUnchanged).toBe(true);
  expect(r.changed).toContain('invalid original receipt'); expect(r.stale).toContain('stale owner or revision');
  expect(r.expiration).toContain('deadline'); expect(r.wrongGeneration).toContain('game generation changed');
  expect(r.allUnchanged).toBe(true); expect(r.afterReset).toContain('game generation changed');
});

test('competing recovery owners cannot both commit', async ({ page }) => {
  const r = await page.evaluate(() => window.custodyRecovery.competing());
  expect(r.statuses.sort()).toEqual(['fulfilled', 'rejected']); expect(r.errors[0]).toContain('stale owner or revision');
  expect(r.revisionDelta).toBe(1); expect(r.head.status).toBe('stopped');
});

test('recovery claim cannot enter ready state, carry gameplay, reuse owner, or grant reserve-backed resume', async ({ page }) => {
  const r = await page.evaluate(() => window.custodyRecovery.controlModes());
  expect(r.claimReady).toContain('control already applied'); expect(r.reserved).toContain('reserved host operation');
  expect(r.effects).toBe(0); expect(r.unchanged).toBe(true); expect(r.sameOwner).toContain('new owner');
  expect(r.failedResume).toContain('control fields'); expect(r.resumeUnchanged).toBe(true);
  expect(r.claimed.status).toBe('stopped'); expect(r.resumed.status).toBe('ready');
  expect(r.resumed.owner).toBe(r.claimed.owner); expect(r.resumed.epoch).toBe(r.claimed.epoch + 1);
});

for (const point of ['receipt', 'head', 'abort'] as const) test(`claim ${point} refusal rolls back all stores and preserves original retry`, async ({ page }) => {
  const r = await page.evaluate(point => window.custodyRecovery.rollback(point), point);
  expect(r.error).toContain(point === 'abort' ? 'AbortError' : 'QuotaExceededError');
  expect(r.unchanged).toBe(true); expect(r.replayed).toBe(true); expect(r.sameReceipt).toBe(true); expect(r.replayUnchanged).toBe(true);
});

for (const explicit of [false, true]) test(`new GameSession funds cleanup through ${explicit ? 'TakeControl' : 'kernel claim'} without resuming play`, async ({ page }) => {
  const r = await page.evaluate(explicit => window.custodyRecovery.hostCleanup(explicit), explicit);
  expect(r.automatic).toContain('storage quota exhausted'); expect(r.automaticUnchanged).toBe(true);
  expect(r.failedView).toEqual({ controlled: false, recoveryRequired: true, busy: false });
  expect(r.deadLifetime).toContain('AbortError'); expect(r.abortedUnchanged).toBe(true); expect(r.sameOwner).toBe(true);
  expect(r.claimed.status).toBe('stopped'); expect(r.replays).toBe(true);
  if (explicit) expect(r.resumeFailure).toContain('storage quota exhausted'); else expect(r.resumeFailure).toBeNull();
  expect(r.finalView).toEqual(r.failedView); expect(r.final.status).toBe('stopped'); expect(r.final.roots).toEqual(r.claimed.roots);
  expect(r.final.quota.reservations).toBe(0); expect(r.final.quota.reservedBytes).toBe(0);
  expect(r.operations).toEqual(Array(16).fill('acknowledged')); expect(r.accounted).toBe(true);
  expect(r.gameplay).toContain('Game control unavailable'); expect(r.deadCleanup).toContain('AbortError');
});

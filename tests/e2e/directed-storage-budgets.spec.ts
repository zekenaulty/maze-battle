import { expect, test } from '@playwright/test';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import { openFixture } from './directed-storage-support';

const finite: DestinationLimits = { steps: 96, replans: 8, durationMs: 30_000 };
const unlimited: DestinationLimits = { steps: null, replans: null, durationMs: null };
const changed: DestinationLimits = { steps: 1, replans: 0, durationMs: 1 };

// Playwright's page fixture creates a fresh browser context for every case.
test.beforeEach(async ({ page }) => openFixture(page));

for (const historyMode of ['checkpoint-v1', 'legacy-full-audit'] as const) {
  for (const limits of [finite, unlimited]) {
    test(`${historyMode}: ${limits.steps === null ? 'unlimited' : 'finite'} limits survive reload, changed policy and exact replay`, async ({ page }) => {
      const original = await page.evaluate(async ({ historyMode, limits, changed }) => {
        const db = window.directedStorage;
        await db.createDirectedSave('budgets', { historyMode, hiddenTrap: false });
        await db.claimDirectedSave('budgets', 'owner-a');
        const request = await db.request('budgets', 'navigate', {
          type: 'navigate', operationId: 'trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
        });
        const started = await db.executeDirectedRequest('budgets', request, 1000, limits);
        Object.assign(limits, changed);
        const stepRequest = await db.request('budgets', 'step-0', { type: 'step', operationId: 'trip', sequence: 0 });
        const moved = await db.executeDirectedRequest('budgets', stepRequest, 1001, changed);
        return { request, started, stepRequest, moved, saved: await db.readDirectedSave('budgets') };
      }, { historyMode, limits, changed });
      const deadline = limits.durationMs === null ? null : 1000 + limits.durationMs;
      expect(original.started.result.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 0, replans: 0, nextStep: 0, status: 'running' });
      expect(original.moved.result.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 1, replans: 0, nextStep: 1, status: 'running' });

      await page.reload();
      await page.waitForFunction(() => !!window.directedStorage);
      const recovered = await page.evaluate(async ({ original, changed, now }) => {
        const db = window.directedStorage, before = await db.rawDirectedDatabase();
        const saved = await db.readDirectedSave('budgets');
        const replay = await db.executeDirectedRequest('budgets', original.stepRequest,
          () => { throw new Error('Replay sampled the clock'); }, changed);
        const startReplay = await db.executeDirectedRequest('budgets', original.request, now, changed);
        const reconciled = await db.reconcileDirectedRequest('budgets', original.stepRequest);
        const afterReplay = await db.rawDirectedDatabase();
        const next = await db.executeDirectedRequest('budgets', await db.request('budgets', 'step-1', {
          type: 'step', operationId: 'trip', sequence: saved!.operation!.nextStep,
        }), now, changed);
        let current = next;
        for (let i = 0; i < 16 && current.result.operation!.status === 'running'; i++) {
          current = await db.executeDirectedRequest('budgets', await db.request('budgets', `finish-${i}`, {
            type: 'step', operationId: 'trip', sequence: current.result.operation!.nextStep,
          }), now, changed);
        }
        return { before, saved, replay, startReplay, reconciled, afterReplay, next, current,
          audit: await db.auditDirectedSave('budgets') };
      }, { original, changed, now: limits.durationMs === null ? 500_000 : 1002 });
      expect(recovered.saved).toEqual(original.saved);
      expect(recovered.replay).toEqual(original.moved);
      expect(recovered.startReplay).toEqual(original.started);
      expect(recovered.reconciled).toEqual(original.moved);
      expect(recovered.afterReplay).toEqual(recovered.before);
      expect(recovered.next.result.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 2, replans: 0, nextStep: 2 });
      expect(recovered.current.result.operation).toMatchObject({ limits, deadline, status: 'arrived', replans: 0 });
      expect(recovered.current.result.operation!.steps).toBeGreaterThan(2);
      expect(recovered.current.result.operation!.nextStep).toBe(recovered.current.result.operation!.steps);
      expect(recovered.audit.world!.features.V.state).toBe('idle');
      expect(recovered.audit.world!.features.D.state).toBe('locked');
      expect(recovered.audit.events.every(event => event.type === 'move')).toBe(true);
      expect(recovered.audit.receipts.every(receipt => receipt.request.command.type !== 'interact')).toBe(true);
    });
  }

  for (const offset of [0, 1]) {
    test(`${historyMode}: custom finite expiry + ${offset} cannot be extended by unlimited policy after reload`, async ({ page }) => {
      const original = await page.evaluate(async historyMode => {
        const db = window.directedStorage;
        await db.createDirectedSave('expiry', { historyMode });
        await db.claimDirectedSave('expiry', 'owner-a');
        const limits = { steps: 96, replans: 8, durationMs: 5 };
        await db.executeDirectedRequest('expiry', await db.request('expiry', 'navigate', {
          type: 'navigate', operationId: 'trip', target: { kind: 'cell', address: { spaceId: 'H', row: 2, column: 1 }, arrival: 'occupy' },
        }), 1000, limits);
        return { before: await db.auditDirectedSave('expiry'), request: await db.request('expiry', 'step-expired', {
          type: 'step', operationId: 'trip', sequence: 0,
        }) };
      }, historyMode);
      await page.reload();
      await page.waitForFunction(() => !!window.directedStorage);
      const result = await page.evaluate(async ({ original, offset, unlimited }) => {
        const db = window.directedStorage;
        const stopped = await db.executeDirectedRequest('expiry', original.request, 1005 + offset, unlimited);
        const after = await db.auditDirectedSave('expiry'), beforeReplay = await db.rawDirectedDatabase();
        const replay = await db.executeDirectedRequest('expiry', original.request,
          () => { throw new Error('Replay sampled the clock'); }, unlimited);
        return { stopped, after, replay, beforeReplay, afterReplay: await db.rawDirectedDatabase() };
      }, { original, offset, unlimited });
      expect(result.stopped.result.operation).toMatchObject({ status: 'interrupted', steps: 0, replans: 0, nextStep: 1,
        startedAt: 1000, deadline: 1005, limits: { steps: 96, replans: 8, durationMs: 5 }, reason: 'Travel time budget exhausted.' });
      expect(result.stopped.eventIds).toEqual([]);
      expect(result.stopped.observationIds).toEqual([]);
      expect(result.after.session.actor).toEqual(original.before.session.actor);
      expect(result.after.session.knowledge).toEqual(original.before.session.knowledge);
      for (const key of ['world', 'events', 'observations', 'projections', 'contexts'] as const) expect(result.after[key]).toEqual(original.before[key]);
      expect(result.after.receipts).toEqual([...original.before.receipts, result.stopped]);
      expect(result.replay).toEqual(result.stopped);
      expect(result.afterReplay).toEqual(result.beforeReplay);
    });
  }

  for (const fence of ['cancel', 'takeover'] as const) {
    test(`${historyMode}: ${fence} fences unlimited travel after reload without effects`, async ({ page }) => {
      const original = await page.evaluate(async ({ historyMode, unlimited }) => {
        const db = window.directedStorage;
        await db.createDirectedSave('fence', { historyMode });
        await db.claimDirectedSave('fence', 'owner-a');
        const request = await db.request('fence', 'navigate', {
          type: 'navigate', operationId: 'trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
        });
        const started = await db.executeDirectedRequest('fence', request, 1000, unlimited);
        const pending = await db.request('fence', 'late-step', { type: 'step', operationId: 'trip', sequence: 0 });
        return { request, started, pending, before: await db.auditDirectedSave('fence') };
      }, { historyMode, unlimited });
      await page.reload();
      await page.waitForFunction(() => !!window.directedStorage);
      const result = await page.evaluate(async ({ original, fence, unlimited }) => {
        const db = window.directedStorage;
        if (fence === 'cancel') await db.executeDirectedRequest('fence', await db.request('fence', 'cancel', {
          type: 'cancel', operationId: 'trip',
        }), 500_000, unlimited);
        else await db.claimDirectedSave('fence', 'owner-b');
        const atFence = await db.rawDirectedDatabase();
        const late = await db.executeDirectedRequest('fence', original.pending,
          () => { throw new Error('Fenced request sampled the clock'); }, unlimited);
        const replay = await db.executeDirectedRequest('fence', original.request,
          () => { throw new Error('Replay sampled the clock'); }, unlimited);
        return { late, replay, atFence, after: await db.rawDirectedDatabase(), audit: await db.auditDirectedSave('fence') };
      }, { original, fence, unlimited });
      expect(result.late.result).toMatchObject({ status: 'refused', reason: fence === 'cancel' ? 'stale-revision' : 'stale-owner' });
      expect(result.late.eventIds).toEqual([]);
      expect(result.late.observationIds).toEqual([]);
      expect(result.replay).toEqual(original.started);
      expect(result.after).toEqual(result.atFence);
      expect(result.audit.session.operation).toMatchObject({ status: 'cancelled', limits: unlimited, deadline: null, steps: 0, replans: 0, nextStep: 0 });
      expect(result.audit.session.actor).toEqual(original.before.session.actor);
      for (const key of ['world', 'events', 'observations', 'projections', 'contexts'] as const) expect(result.audit[key]).toEqual(original.before[key]);
    });
  }
}

test('legacy operation without limits reads and replays without migration and still expires at the original default deadline', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.setup('legacy');
    const request = await db.request('legacy', 'navigate', {
      type: 'navigate', operationId: 'trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
    });
    const started = await db.executeDirectedRequest('legacy', request, 1000);
    // Represent the pre-limits on-disk shape in this fresh legacy-audit slot only.
    await db.transaction(async tx => {
      const saved = (await tx.objectStore('saves').get('legacy'))!;
      delete saved.session.operation!.limits;
      await tx.objectStore('saves').put(saved, 'legacy');
      const receipt = (await tx.objectStore('receipts').get(['legacy', 'navigate']))!;
      delete receipt.result.operation!.limits;
      await tx.objectStore('receipts').put(receipt, ['legacy', 'navigate']);
    });
    return { request, started, raw: await db.rawDirectedDatabase() };
  });
  expect(original.started.result.operation).toMatchObject({ limits: { steps: 64, replans: 4, durationMs: 120_000 }, deadline: 121_000 });
  await page.reload();
  await page.waitForFunction(() => !!window.directedStorage);
  const result = await page.evaluate(async ({ request, unlimited }) => {
    const db = window.directedStorage;
    const saved = await db.readDirectedSave('legacy');
    const replay = await db.executeDirectedRequest('legacy', request,
      () => { throw new Error('Replay sampled the clock'); }, unlimited);
    const afterReads = await db.rawDirectedDatabase(), before = await db.auditDirectedSave('legacy');
    const stopped = await db.executeDirectedRequest('legacy', await db.request('legacy', 'expired', {
      type: 'step', operationId: 'trip', sequence: 0,
    }), 121_000, unlimited);
    return { saved, replay, afterReads, before, stopped, after: await db.auditDirectedSave('legacy') };
  }, { request: original.request, unlimited });
  expect(result.saved!.operation).not.toHaveProperty('limits');
  expect(result.replay.result.operation).not.toHaveProperty('limits');
  const expectedReplay = structuredClone(original.started);
  delete expectedReplay.result.operation!.limits;
  expect(result.replay).toEqual(expectedReplay);
  expect(result.afterReads).toEqual(original.raw);
  expect(result.stopped.result.operation).toMatchObject({ deadline: 121_000, steps: 0, replans: 0, nextStep: 1, status: 'interrupted', reason: 'Travel time budget exhausted.' });
  expect(result.stopped.observationIds).toEqual([]);
  expect(result.stopped.eventIds).toEqual([]);
  expect(result.after.session.actor).toEqual(result.before.session.actor);
  for (const key of ['world', 'events', 'observations', 'projections', 'contexts'] as const) expect(result.after[key]).toEqual(result.before[key]);
});

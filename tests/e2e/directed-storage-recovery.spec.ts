import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('lost acknowledgment is recovered without replaying effects after takeover', async ({ page }) => {
  const request = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'lost-ack', { type: 'look' });
    await db.executeDirectedRequest('fixture', request, 100).then(() => {
      throw new Error('Simulated lost acknowledgment after commit');
    }).catch(() => {});
    await db.claimDirectedSave('fixture', 'owner-b');
    return request;
  });
  await page.reload();
  const result = await page.evaluate(async request => {
    const db = window.directedStorage;
    const before = await db.auditDirectedSave('fixture');
    const receipt = await db.reconcileDirectedRequest('fixture', request);
    const replay = await db.executeDirectedRequest('fixture', request, 999);
    return { before, after: await db.auditDirectedSave('fixture'), receipt, replay };
  }, request);
  expect(result.receipt?.result.status).toBe('applied'); expect(result.replay).toEqual(result.receipt);
  expect(result.after).toEqual(result.before);
});

test('deadline interruption consumes a fresh step sequence without movement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const started = await db.executeDirectedRequest('fixture', await db.request('fixture', 'nav', {
      type: 'navigate', operationId: 'op', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
    }), 100);
    const before = await db.auditDirectedSave('fixture');
    const operation = started.result.operation!;
    const request = await db.request('fixture', 'expired-step', { type: 'step', operationId: 'op', sequence: operation.nextStep });
    const interrupted = await db.executeDirectedRequest('fixture', request, operation.deadline);
    return { before, after: await db.auditDirectedSave('fixture'), interrupted, operation };
  });
  expect(result.interrupted.result.status).toBe('applied');
  expect(result.interrupted.result.operation!.status).toBe('interrupted');
  expect(result.interrupted.result.operation!.nextStep).toBe(result.operation.nextStep + 1);
  expect(result.after.session.revision).toBe(result.before.session.revision + 1);
  expect(result.after.world).toEqual(result.before.world); expect(result.after.events).toEqual(result.before.events);
});

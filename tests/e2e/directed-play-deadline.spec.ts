import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

const slot = 'known-destination-proof-v1';

test('pause and reload retain the original wall-time budget; resume at equality cannot move', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(1000));
  await page.goto('/?expedition=3');
  await page.getByRole('button', { name: 'Travel', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-operation', 'running');
  await page.getByRole('button', { name: 'Pause travel' }).click();
  await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel paused');
  const inspector = await context.newPage();
  await openFixture(inspector);
  const before = await inspector.evaluate(slot => window.directedStorage.auditDirectedSave(slot), slot);
  expect(before.session.operation).toMatchObject({ startedAt: 1000, deadline: 121000, status: 'running' });
  await page.clock.setFixedTime(new Date(before.session.operation!.deadline));
  await page.reload();
  await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel paused');
  const reloaded = await inspector.evaluate(slot => window.directedStorage.readDirectedSave(slot), slot);
  expect(reloaded).toEqual(before.session);
  await page.getByRole('button', { name: 'Resume travel' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-operation', 'interrupted');
  await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel time budget exhausted.');
  const after = await inspector.evaluate(slot => window.directedStorage.auditDirectedSave(slot), slot);
  expect(after.session.operation).toMatchObject({ startedAt: 1000, deadline: 121000,
    steps: before.session.operation!.steps, nextStep: before.session.operation!.nextStep + 1 });
  expect(after.session.actor).toEqual(before.session.actor);
  expect(after.session.knowledge).toEqual(before.session.knowledge);
  for (const journal of ['world', 'observations', 'projections', 'events'] as const) expect(after[journal]).toEqual(before[journal]);
});

test('hook recovery of an uncommitted pending step uses current wall time without renewing its deadline', async ({ page, context }) => {
  await openFixture(page);
  const before = await page.evaluate(async slot => {
    const db = window.directedStorage;
    await db.createDirectedSave(slot, { historyMode: 'checkpoint-v1' });
    await db.claimDirectedSave(slot, 'recover-owner');
    await db.executeDirectedRequest(slot, await db.request(slot, 'navigate', { type: 'navigate', operationId: 'trip',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), () => 1000);
    const request = await db.request(slot, 'pending-step', { type: 'step', operationId: 'trip', sequence: 0 });
    sessionStorage.setItem('maze-directed-controller-v1', 'recover-owner');
    sessionStorage.setItem('maze-directed-pending-v1', JSON.stringify(request));
    return db.auditDirectedSave(slot);
  }, slot);
  await page.clock.setFixedTime(new Date(before.session.operation!.deadline + 1));
  await page.goto('/?expedition=3');
  await expect(page.locator('main')).toHaveAttribute('data-operation', 'interrupted');
  expect(await page.evaluate(() => sessionStorage.getItem('maze-directed-pending-v1'))).toBeNull();
  const inspector = await context.newPage();
  await openFixture(inspector);
  const after = await inspector.evaluate(slot => window.directedStorage.auditDirectedSave(slot), slot);
  expect(after.session.operation).toMatchObject({ startedAt: 1000, deadline: 121000, steps: 0, nextStep: 1 });
  expect(after.session.actor).toEqual(before.session.actor);
  expect(after.session.knowledge).toEqual(before.session.knowledge);
  for (const journal of ['world', 'observations', 'projections', 'events'] as const) expect(after[journal]).toEqual(before[journal]);
  expect(after.receipts.at(-1)).toMatchObject({ request: { attemptId: 'pending-step' }, observationIds: [], eventIds: [] });
});

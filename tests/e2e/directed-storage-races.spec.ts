import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('two tabs serialize same revision, identical attempts, and same-owner claims', async ({ page, context }) => {
  const second = await context.newPage(); await openFixture(second);
  await page.evaluate(() => window.directedStorage.setup());
  const request = await page.evaluate(() => window.directedStorage.request('fixture', 'same', { type: 'look' }));
  const twins = await Promise.all([page, second].map(tab => tab.evaluate(request =>
    window.directedStorage.executeDirectedRequest('fixture', request, 100), request)));
  expect(twins[0]).toEqual(twins[1]);
  const competing = await page.evaluate(() => window.directedStorage.request('fixture', 'first', { type: 'look' }));
  const results = await Promise.all([page, second].map((tab, index) => tab.evaluate(request =>
    window.directedStorage.executeDirectedRequest('fixture', request, 200), { ...competing, attemptId: `competitor-${index}` })));
  expect(results.map(value => value.result.status).sort()).toEqual(['applied', 'refused']);
  const claims = await Promise.all([page, second].map(tab => tab.evaluate(() => window.directedStorage.claimDirectedSave('fixture', 'owner-b'))));
  expect(claims[0]).toEqual(claims[1]);
  expect(await page.evaluate(async () => (await window.directedStorage.auditDirectedSave('fixture')).receipts.length)).toBe(2);
});

test('takeover cancels running navigation; old step cannot mutate; operation IDs cannot be reused', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const navigation = await db.request('fixture', 'navigate', { type: 'navigate', operationId: 'op-1',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } });
    const started = await db.executeDirectedRequest('fixture', navigation, 100);
    const oldStep = await db.request('fixture', 'old-step', { type: 'step', operationId: 'op-1', sequence: started.result.operation!.nextStep });
    const takeover = await db.claimDirectedSave('fixture', 'owner-b');
    const before = await db.auditDirectedSave('fixture');
    const stale = await db.executeDirectedRequest('fixture', oldStep, 101);
    let error = '';
    try { await db.executeDirectedRequest('fixture', await db.request('fixture', 'reuse', navigation.command), 102); }
    catch (caught) { error = String(caught); }
    return { started, takeover, before, stale, error, after: await db.auditDirectedSave('fixture'),
      original: await db.reconcileDirectedRequest('fixture', navigation) };
  });
  expect(result.started.result.operation?.status).toBe('running'); expect(result.takeover.operation?.status).toBe('cancelled');
  expect(result.takeover.epoch).toBe(result.started.request.epoch + 1);
  expect(result.stale.result.status).toBe('refused'); expect(result.error).toContain('operation ID already used');
  expect(result.after).toEqual(result.before); expect(result.original).toEqual(result.started);
});

test('cancellation is durable, step sequence cannot execute twice, and older operation IDs stay reserved', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const command = { type: 'navigate' as const, operationId: 'first-op', target: { kind: 'feature' as const, featureId: 'V', arrival: 'adjacent' as const } };
    const started = await db.executeDirectedRequest('fixture', await db.request('fixture', 'nav-1', command), 100);
    const step = { type: 'step' as const, operationId: command.operationId, sequence: started.result.operation!.nextStep };
    const stepped = await db.executeDirectedRequest('fixture', await db.request('fixture', 'step-1', step), 101);
    const beforeDuplicate = await db.readDirectedSave('fixture');
    const duplicate = await db.executeDirectedRequest('fixture', await db.request('fixture', 'step-duplicate', step), 102);
    const afterDuplicate = await db.readDirectedSave('fixture');
    const cancelled = await db.executeDirectedRequest('fixture', await db.request('fixture', 'cancel', { type: 'cancel', operationId: command.operationId }), 103);
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'nav-2', { ...command, operationId: 'second-op' }), 104);
    let error = '';
    try { await db.executeDirectedRequest('fixture', await db.request('fixture', 'reuse-old', command), 105); }
    catch (caught) { error = String(caught); }
    return { step, stepped, duplicate, beforeDuplicate, afterDuplicate, cancelled, error };
  });
  expect(result.stepped.result.operation!.nextStep).toBe(result.step.sequence + 1);
  expect(result.duplicate.result.status).toBe('refused'); expect(result.afterDuplicate).toEqual(result.beforeDuplicate);
  expect(result.cancelled.result.operation!.status).toBe('cancelled'); expect(result.error).toContain('operation ID already used');
});

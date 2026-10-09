import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test('one intention crosses known rooms, reconciles a lost move acknowledgment, and resumes after reload', async ({ page }) => {
  await openFixture(page);
  const request = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    await db.captureDirectedContext('fixture', 'before-intention', 'decision-fixture');
    const nav = await db.request('fixture', 'navigate', { type: 'navigate', operationId: 'return-lever',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } });
    await db.executeDirectedRequest('fixture', nav, 1000);
    const request = await db.request('fixture', 'lost-move', { type: 'step', operationId: 'return-lever', sequence: 0 });
    await db.executeDirectedRequest('fixture', request, 1100);
    return request; // The caller retains its request identity, not the discarded result.
  });
  await page.reload();
  const results = await page.evaluate(async request => {
    const db = window.directedStorage;
    const before = await db.auditDirectedSave('fixture');
    const original = await db.reconcileDirectedRequest('fixture', request);
    const replay = await db.executeDirectedRequest('fixture', request, 1200);
    const afterReplay = await db.auditDirectedSave('fixture');
    let state = afterReplay.session;
    for (let n = 0; n < 64 && state.operation?.status === 'running'; n++) {
      const command = { type: 'step' as const, operationId: state.operation.id, sequence: state.operation.nextStep };
      await db.executeDirectedRequest('fixture', await db.request('fixture', `step-${n}`, command), 1300 + n);
      state = (await db.readDirectedSave('fixture'))!;
    }
    const audit = await db.auditDirectedSave('fixture');
    return { before, original, replay, afterReplay, audit };
  }, request);
  expect(results.replay).toEqual(results.original);
  expect(results.afterReplay).toEqual(results.before);
  expect(results.audit.session.operation?.status).toBe('arrived');
  expect(results.audit.session.operation!.steps).toBeGreaterThan(4);
  expect(results.audit.world!.features.V.state).toBe('idle');
  expect(results.audit.receipts.filter(r => r.request.command.type === 'navigate')).toHaveLength(1);
  expect(results.audit.events.filter(e => e.type === 'interact')).toHaveLength(0);
  expect(results.audit.contexts[0]).toEqual(results.before.contexts[0]);
  expect(results.audit.contexts[0].json).not.toContain('Hidden Trap');
  expect(results.audit.projections.length).toBe(results.audit.observations.length + 1);
  expect(new Set(results.audit.events.map(e => e.id)).size).toBe(results.audit.events.length);
});

test('routine checkpoints keep old context exact while the remembered projection advances', async ({ page }) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const presented = await db.captureDirectedContext('fixture', 'activation-1', 'decision-fixture');
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'go', { type: 'navigate', operationId: 'go',
      target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } }), 0);
    await db.executeDirectedRequest('fixture', await db.request('fixture', 'step', { type: 'step', operationId: 'go', sequence: 0 }), 1);
    const later = await db.captureDirectedContext('fixture', 'activation-2', 'decision-fixture');
    return { presented, later, audit: await db.auditDirectedSave('fixture') };
  });
  expect(result.presented.knowledgeRevision).toBeLessThan(result.later.knowledgeRevision);
  expect(result.audit.contexts.find(c => c.id === 'activation-1')).toEqual(result.presented);
  expect(result.audit.projections.find(k => k.revision === result.presented.knowledgeRevision)).toBeDefined();
});

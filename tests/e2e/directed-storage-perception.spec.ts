import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

for (const profile of ['untrained', 'alert', 'keen', 'expert'] as const) {
  test(`${profile}: inspection disclosure, exact receipts and historical context survive reload`, async ({ page }) => {
    const before = await page.evaluate(async perceptionProfile => {
      const db = window.directedStorage;
      await db.createDirectedSave('perception', { perceptionProfile });
      await db.claimDirectedSave('perception', 'owner');
      const send = async (id: string, command: Parameters<typeof db.request>[2]) => db.executeDirectedRequest('perception',
        await db.request('perception', id, command), 100);
      await send('travel', { type: 'navigate', operationId: 'passage',
        target: { kind: 'cell', address: { spaceId: 'W', row: 0, column: 0 }, arrival: 'occupy' } });
      for (let step = 0; step < 64; step++) {
        const current = (await db.readDirectedSave('perception'))!;
        if (current.operation?.status !== 'running') break;
        await send(`step-${step}`, { type: 'step', operationId: 'passage', sequence: current.operation.nextStep });
      }
      const request = await db.request('perception', 'inspect-east', { type: 'inspect', direction: 'east' });
      const receipt = await db.executeDirectedRequest('perception', request, 200);
      const context = await db.captureDirectedContext('perception', 'original-inspection', 'decision-fixture');
      const human = await db.captureDirectedContext('perception', 'human-inspection', 'human-view');
      const audit = await db.auditDirectedSave('perception');
      await send('subsequent-look', { type: 'look' });
      return { request, receipt, context, human, observation: audit.observations.at(-1), count: audit.receipts.length };
    }, profile);
    expect(before.receipt.result.status).toBe('applied');
    expect(before.context.json).toBe(before.human.json);
    expect(before.observation?.scene.inspection).toMatchObject({ attemptId: 'inspect-east', direction: 'east' });
    expect(before.observation?.scene.features.some(value => value.id === 'T')).toBe(profile === 'keen' || profile === 'expert');
    expect(before.observation?.scene.cues).toHaveLength(profile === 'alert' ? 1 : 0);
    expect(before.observation?.scene.examinations).toHaveLength(profile === 'expert' ? 1 : 0);
    if (profile === 'untrained' || profile === 'alert') expect(before.context.json).not.toContain('"T"');
    await page.reload();
    const replayed = await page.evaluate(async request => {
      const db = window.directedStorage;
      await db.claimDirectedSave('perception', 'new-owner');
      return {
        receipt: await db.executeDirectedRequest('perception', request, 999),
        context: await db.captureDirectedContext('perception', 'original-inspection', 'decision-fixture'),
        audit: await db.auditDirectedSave('perception'),
      };
    }, before.request);
    expect(replayed.receipt).toEqual(before.receipt);
    expect(replayed.context).toEqual(before.context);
    expect(replayed.audit.receipts).toHaveLength(before.count + 1);
    expect(replayed.audit.observations.find(value => value.id === before.observation?.id)).toEqual(before.observation);
  });
}

test('inspection request cannot supply perception power or a remote viewpoint', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'forged', { type: 'inspect', direction: 'east' });
    const errors: string[] = [];
    for (const extra of [{ effectiveValue: 999 }, { viewpoint: { spaceId: 'W', row: 0, column: 0 } }, { featureId: 'T' }]) {
      try { await db.executeDirectedRequest('fixture', { ...request, command: { ...request.command, ...extra } }, 0); }
      catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(errors).toHaveLength(3);
  expect(errors.every(error => error.includes('unexpected fields'))).toBe(true);
});

import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

for (const fault of ['missing', 'action', 'admission', 'provider', 'manifest', 'event', 'epoch', 'usage', 'same-run',
  'missing-settled-usage', 'regressed-settled-usage', 'waking', 'foreign-adoption', 'suppressed-marker', 'claimed-run'] as const) {
  test(`verified root ACK cannot discharge navigation with ${fault} operation evidence`, async ({ page }) => {
    await seedRootStop(page, { mode: fault === 'suppressed-marker' ? 'suppressed' : fault === 'claimed-run' ? 'claimed' : 'lost' });
    const result = await page.evaluate(async fault => {
      const c = window.canonicalDecisionController, original = c.remote().entry;
      const entry = original as typeof original & { settledUsage?: typeof original.usage };
      if (fault === 'missing') c.configure({ unavailable: true });
      if (fault === 'action') entry.action.actionId = crypto.randomUUID();
      if (fault === 'admission') entry.admission!.operation!.operationId = crypto.randomUUID();
      if (fault === 'provider') entry.request.provider.model = 'foreign-model';
      if (fault === 'manifest') entry.action.manifestHash = `sha256:${'f'.repeat(64)}`;
      if (fault === 'event') entry.latestEvent!.summary += ' changed';
      if (fault === 'epoch') entry.activeEpoch = '999';
      if (fault === 'usage') entry.usage.providerCalls++;
      if (fault === 'same-run') entry.wakeRunId = entry.action.runId;
      if (fault === 'missing-settled-usage') delete entry.settledUsage;
      if (fault === 'regressed-settled-usage') entry.settledUsage!.continuations = entry.usage.continuations;
      if (fault === 'waking') { entry.state = 'waking'; delete entry.settledUsage; }
      if (fault === 'foreign-adoption') entry.wakeAdoption = { adoptionId: crypto.randomUUID(), nextSessionEpoch: entry.activeEpoch,
        observation: structuredClone(entry.request.observation) };
      if (fault === 'suppressed-marker') delete entry.stopDecision;
      if (fault === 'claimed-run') entry.wakeRunId = crypto.randomUUID();
      c.replaceRemoteEntry(entry); const before = await c.dump(), funding = await c.funding(), count = c.calls().length;
      const ack = await c.wait(c.begin('ack'));
      return { ack, unchanged: before === await c.dump(), funding, after: await c.funding(), calls: c.calls().slice(count) };
    }, fault);
    expect(result.ack.status).toBe('rejected'); expect(result.unchanged).toBe(true); expect(result.after).toEqual(result.funding);
    expect(result.after.navigation!.state).toBe('settled');
    expect(result.after.head.allocations[result.after.navigation!.id].bytes).toBeGreaterThan(0);
    expect(result.calls.map(c => c.method)).toEqual(['list']);
  });
}

test('continued child evidence without verified root ACK requires separate recovery and never stops the parent decision', async ({ page }) => {
  await seedRootStop(page, { mode: 'claimed', rootAck: false });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, before = await c.dump(), count = c.calls().length;
    const ack = await c.wait(c.begin('ack'));
    return { ack, unchanged: before === await c.dump(), funding: await c.funding(), calls: c.calls().slice(count) };
  });
  expect(result.ack).toMatchObject({ status: 'rejected', error: expect.stringContaining('recovery') });
  expect(result.unchanged).toBe(true); expect(result.funding.root!.state).toBe('settled');
  expect(result.funding.navigation!.state).toBe('settled'); expect(result.calls.map(c => c.method)).toEqual(['list']);
});

import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('verified root ACK alone cannot discharge navigation without a retained decision intention', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create();
    await c.wait(c.begin('cancel')); await c.acknowledgeRoot(await c.rootEntry());
    const before = await c.dump(), count = c.calls().length, ack = await c.wait(c.begin('ack'));
    return { ack, unchanged: before === await c.dump(), funding: await c.funding(), state: await c.state(), calls: c.calls().slice(count) };
  });
  expect(result.ack.status).toBe('rejected'); expect(result.unchanged).toBe(true); expect(result.state.intent).toBeNull();
  expect(result.funding.root!.state).toBe('acknowledged'); expect(result.funding.navigation!.state).toBe('settled');
  expect(result.funding.head.allocations[result.funding.navigation!.id].bytes).toBeGreaterThan(0); expect(result.calls).toEqual([]);
});

for (const fault of ['missing-root-source', 'foreign-root-admission', 'invalid-root-settlement', 'missing-intent-source', 'missing-claim-record',
  'missing-action-record', 'missing-admission-record', 'missing-progress-source', 'missing-terminal-source'] as const) {
  test(`root Stop discharge refuses ${fault} without releasing navigation funding`, async ({ page }) => {
    await seedRootStop(page, { mode: fault === 'missing-claim-record' ? 'claimed' : 'lost' });
    const result = await page.evaluate(async fault => {
      const c = window.canonicalDecisionController, root = await c.rootState(), state = await c.state();
      if (fault === 'missing-root-source') await c.deleteEvidence('receipts', root.acknowledgement!.source.attemptId);
      if (fault === 'missing-intent-source') await c.deleteEvidence('receipts', state.intent!.source.attemptId);
      if (fault === 'missing-claim-record') await c.deleteEvidence('records', state.claim!.row.id);
      if (fault === 'missing-progress-source') await c.deleteEvidence('receipts', state.progress.sourceAttemptId);
      if (fault === 'missing-terminal-source') await c.deleteEvidence('receipts', state.operation.terminal!.attemptId);
      if (fault === 'missing-action-record' || fault === 'missing-admission-record') {
        const original = (await c.retained(c.remote().entry.action))!;
        await c.deleteEvidence('records', fault === 'missing-action-record' ? original.reference.id : original.resultReference!.id);
      }
      if (fault === 'foreign-root-admission' || fault === 'invalid-root-settlement') {
        const source = root.acknowledgement!.source, proof = (source.input as JsonObject).proof as JsonObject;
        if (fault === 'foreign-root-admission') (proof.admission as JsonObject).runId = crypto.randomUUID();
        else (proof.terminal as JsonObject).usageUnknown = true;
        await c.replaceSource(source);
      }
      const before = await c.dump(), funding = await c.funding(), count = c.calls().length, ack = await c.wait(c.begin('ack'));
      return { ack, unchanged: before === await c.dump(), funding, after: await c.funding(), calls: c.calls().slice(count) };
    }, fault);
    expect(result.ack.status).toBe('rejected'); expect(result.unchanged).toBe(true); expect(result.after).toEqual(result.funding);
    expect(result.after.navigation!.state).toBe('settled');
    expect(result.after.head.allocations[result.after.navigation!.id].bytes).toBeGreaterThan(0);
    expect(result.calls.some(c => c.method === 'stop-decision')).toBe(false);
  });
}

for (const missing of ['root-source', 'intent-record', 'claim-record'] as const) {
  test(`historical decision-root-stop ACK still validates its retained ${missing}`, async ({ page }) => {
    await seedRootStop(page, { mode: missing === 'claim-record' ? 'claimed' : 'lost' });
    const result = await page.evaluate(async missing => {
      const c = window.canonicalDecisionController; await c.acknowledge();
      const root = await c.rootState(), state = await c.state();
      if (missing === 'root-source') await c.deleteEvidence('receipts', root.acknowledgement!.source.attemptId);
      else await c.deleteEvidence('records', missing === 'intent-record' ? state.intent!.row.id : state.claim!.row.id);
      const before = await c.dump(), count = c.calls().length, ack = await c.wait(c.begin('ack'));
      const readError = await c.state().then(() => '', String);
      return { ack, readError, unchanged: before === await c.dump(), funding: await c.funding(), calls: c.calls().slice(count) };
    }, missing);
    expect(result.ack.status).toBe('rejected'); expect(result.readError).not.toBe(''); expect(result.unchanged).toBe(true);
    expect(result.funding.navigation!.state).toBe('acknowledged'); expect(result.calls).toEqual([]);
  });
}

test('historical navigation ACK cannot borrow a verified root receipt committed after it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.acknowledge(); const original = (await c.state()).acknowledgement!;
    c.settle('continued'); await c.wait(c.begin('cancel')); await c.acknowledgeRoot(await c.rootEntry());
    const state = await c.state(), root = await c.rootState(), entry = c.remote().entry;
    const source = structuredClone(original.source), proof = (source.input as JsonObject).proof as JsonObject;
    proof.delivery = 'decision-root-stop';
    proof.decision = { intent: { ...state.intent!.reference }, claim: { ...state.claim!.reference },
      rootAcknowledgement: root.acknowledgement!.source.attemptId };
    proof.remote = { runId: entry.wakeRunId!, activeEpoch: entry.activeEpoch, state: entry.state, usage: { ...entry.usage },
      settledUsage: { ...entry.usage, continuations: entry.usage.continuations + 1 }, stopped: false };
    await c.replaceSource(source); const before = await c.dump(), count = c.calls().length, ack = await c.wait(c.begin('ack'));
    return { original, root, ack, unchanged: before === await c.dump(), calls: c.calls().slice(count) };
  });
  expect(result.root.acknowledgement!.receipt.afterRevision).toBeGreaterThan(result.original.receipt.afterRevision);
  expect(result.ack).toMatchObject({ status: 'rejected', error: expect.stringContaining('precede') });
  expect(result.unchanged).toBe(true); expect(result.calls).toEqual([]);
});

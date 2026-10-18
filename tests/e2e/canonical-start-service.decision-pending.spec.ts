import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { retainPendingSuccessor, reloadPendingSuccessor } from './canonical-start-service.pending.steps';
import { waitPendingRunTerminal } from './canonical-start-service.pending-run';

test('pending ungranted successor survives browser reload as unresolved custody, not fabricated terminal recovery', async ({ page, wire }, info) => {
  const setup = await retainPendingSuccessor(page, wire, info);
  const { action, runId, original, retained, custody, counters, sentBeforeReload } = setup;
  await reloadPendingSuccessor(page, wire, setup);
  const canonicalBefore = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  const recovery = await page.evaluate(action => window.canonicalStartService.recoverPendingCustody(action), action);
  expect(recovery).toEqual([{ actionId: action.actionId, runId, sessionEpoch: action.sessionEpoch, status: 'unresolved', resolved: false }]);
  expect(await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence())).toEqual(canonicalBefore);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const stoppedRun = await waitPendingRunTerminal(action);
  const pending = await page.evaluate(() => window.canonicalStartService.readDecision());
  const receipts = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(receipts.navigation.acknowledgement).toBeNull(); expect(receipts.root.acknowledgement).toBeNull();

  // Gap reproduction: the real service must not certify cleanup while dispatched action custody is unresolved.
  wire.expectedRefusals.push({ path: '/api/operations/stop-decision', status: 409, code: 'session.unresolved' });
  const refusal = await page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return { code: '', message: '' }; }
    catch (error) { return { code: String((error as { code?: unknown }).code ?? ''), message: String(error) }; }
  });
  expect(refusal.code).toBe('session.unresolved');
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const final = await page.evaluate(() => window.canonicalStartService.readDecision());
  const remaining = await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action);
  const canonicalAfter = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  expect(canonicalAfter.effects).toEqual(canonicalBefore.effects);
  expect(canonicalAfter.publications).toEqual(canonicalBefore.publications);
  expect(final.head).toEqual(pending.head); expect(final.head.checkpoint).toEqual(retained.head.checkpoint);
  expect(final.grant).toBeNull(); expect(final.selection).toEqual(original.selection);
  expect(final.intent!.data).toEqual(retained.intent!.data); expect(final.claim!.data).toEqual(retained.claim!.data);
  expect(final.launch!.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(final.operation!.operation.state).toBe('settled');
  expect(final.head.allocations[final.launch!.guard.id]).toBeDefined();
  expect(final.head.allocations[final.operation!.operation.id]).toBeDefined();
  expect(remaining).toEqual(custody);
  expect(await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence())).toEqual(receipts);
  expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sentBeforeReload)).toEqual([]);
  expect(wire.http.filter(item => item.method === 'POST' && item.url.includes('/api/recovery'))).toEqual([]);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
  await info.attach('unresolved-recovery-gap.json', { body: JSON.stringify({ refusal, recovery, remaining, receipts, final, stoppedRun, canonicalBefore, canonicalAfter,
    qualification: 'Safe refusal only; terminal recovery is missing, not solved.' }, null, 2), contentType: 'application/json' });
});

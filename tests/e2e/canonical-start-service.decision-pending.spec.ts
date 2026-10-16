import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { reloadDecision } from './canonical-start-service.decision-adoption.steps';
import { pulseError } from './canonical-start-service.decision-recovery.steps';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

test('pending ungranted successor survives browser reload as unresolved custody, not fabricated terminal recovery', async ({ page, wire }, info) => {
  const { before, original } = await completeInitialDecision(page);
  const reference = original.originals[3]!.reference;
  await reloadDecision(page, reference);
  await page.evaluate(() => window.canonicalStartService.prepareDecision());
  for (const status of ['connected', 'prefix-delivered', 'claimed'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
  const retained = await page.evaluate(() => window.canonicalStartService.readDecision());
  const runId = retained.claim!.data.started.runId;
  expect(retained.claim!.data.state).toBe('waking'); expect(retained.grant).toBeNull();
  expect(retained.launch!.guard).toEqual(original.launch!.guard); expect(retained.results).toEqual([]);
  await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'action.request' && frame.runId === runId)).toBe(true);
  const request = wire.received.find(({ frame }) => frame.type === 'action.request' && frame.runId === runId)!.frame;
  const action = request.payload as unknown as AgenticaAction;
  expect(action).toMatchObject({ runId, sessionId: original.started.sessionId, sessionEpoch: retained.claim!.data.started.sessionEpoch,
    capabilityId: 'maze.inspect', manifestHash: retained.claim!.data.started.manifestHash });
  const custody = await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action);
  expect(custody.entries).toHaveLength(1);
  expect(custody.entries[0]).toMatchObject({ request: action, runId, sessionEpoch: action.sessionEpoch, result: null, resultHash: null });
  expect(custody.entries[0].requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(custody.entries[0].capabilityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(custody.canonical).toBeNull(); expect(custody.reconciled).toBeNull();
  expect(wire.sent.filter(frame => frame.type === 'action.result' && frame.runId === runId)).toEqual([]);
  expect(wire.received.filter(({ frame }) => frame.type === 'outcome' && frame.runId === runId)).toEqual([]);
  const counters = await serviceProof(), sentBeforeReload = wire.sent.length;
  expect(counterDelta(counters, before)).toEqual({ created: 2, initial: scriptedWindow,
    successor: { instances: 1, createCalls: 1, refineCalls: 0, stepsPlanned: 1, emptyPlans: 0 } });
  await info.attach('pending-action-before-reload.json', { body: JSON.stringify({ request, custody, retained, counters }, null, 2), contentType: 'application/json' });

  const reconstructed = await reloadDecision(page, reference);
  expect(reconstructed.head.owner).not.toBe(retained.head.owner); expect(reconstructed.head.epoch).toBeGreaterThan(retained.head.epoch);
  expect(reconstructed.head.checkpoint).toEqual(retained.head.checkpoint);
  expect(reconstructed.intent).toEqual(retained.intent); expect(reconstructed.claim).toEqual(retained.claim);
  expect(reconstructed.grant).toBeNull(); expect(reconstructed.selection).toEqual(original.selection);
  expect((await pulseError(page)).message).toContain('current-owner intention');
  expect(wire.sent.slice(sentBeforeReload)).toEqual([]); expect(await serviceProof()).toEqual(counters);
  expect(await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action)).toEqual(custody);
  const recovery = await page.evaluate(action => window.canonicalStartService.recoverPendingCustody(action), action);
  expect(recovery).toEqual([{ actionId: action.actionId, runId, sessionEpoch: action.sessionEpoch, status: 'unresolved', resolved: false }]);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
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
  await info.attach('unresolved-recovery-gap.json', { body: JSON.stringify({ refusal, recovery, remaining, receipts, final,
    qualification: 'Safe refusal only; terminal recovery is missing, not solved.' }, null, 2), contentType: 'application/json' });
});

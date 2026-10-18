import { test, expect } from './canonical-start-service.decision.test';
import { retainPendingSuccessor, reloadPendingSuccessor } from './canonical-start-service.pending.steps';
import { readPendingRun, waitPendingRunTerminal } from './canonical-start-service.pending-run';
import { fundedQuota } from './canonical-start-service.decision-stop.steps';
import { assertNoEffectResult, assertPendingQuiescent, assertRetainedRecovery, canonicalEvidence,
  recoveryEnvelope, settlePendingAtQuota, tryPendingRecovery } from './canonical-start-service.pending-recovery.steps';

test('pending successor reload recovers the production no-effect proof and both funded ACKs at ordinary quota', async ({ page, wire }, info) => {
  const setup = await retainPendingSuccessor(page, wire, info), { action } = setup;
  await reloadPendingSuccessor(page, wire, setup);
  const beforeStop = await canonicalEvidence(page), requests = wire.http.length;
  expect((await tryPendingRecovery(page, action)).error!.message).toContain('launch has no cancellation receipt');
  expect(wire.http).toHaveLength(requests); expect(await canonicalEvidence(page)).toEqual(beforeStop);
  expect(await page.evaluate(action => window.canonicalStartService.recoverPendingCustody(action), action))
    .toEqual([{ actionId: action.actionId, runId: action.runId, sessionEpoch: action.sessionEpoch, status: 'unresolved', resolved: false }]);

  await fundedQuota(page);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  const stopped = await canonicalEvidence(page);
  expect(await readPendingRun(action)).toMatchObject({ terminal: false, completionCompleted: false, unresolved: true });
  wire.expectedRefusals.push({ method: 'POST', path: '/api/recovery', status: 409, code: 'recovery.live_run' });
  expect((await tryPendingRecovery(page, action)).error!.code).toBe('recovery.live_run');
  const original = recoveryEnvelope(wire, action);
  await assertNoEffectResult(page, setup, original.envelope.result);
  expect(await canonicalEvidence(page)).toEqual(stopped);
  expect(await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action)).toEqual(setup.custody);
  expect(await page.evaluate(action => window.canonicalStartService.readExactPendingCustody(action), action)).toEqual(setup.custody.entries[0]);
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const terminalRun = await waitPendingRunTerminal(action);

  wire.expectedRefusals.push({ method: 'POST', path: '/api/operations/stop-decision', status: 409, code: 'session.unresolved' });
  const refusal = await page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return ''; }
    catch (error) { return String((error as { code?: unknown }).code ?? ''); }
  });
  expect(refusal).toBe('session.unresolved');
  const recovered = await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action);
  expect(recovered).toEqual({ status: 'action-reconciled', result: original.envelope.result, duplicate: false,
    rootClear: 'unknown', sessionClear: 'unknown' });
  expect(recoveryEnvelope(wire, action).serialized).toBe(original.serialized);
  expect(await canonicalEvidence(page)).toEqual(stopped);
  const retained = await assertRetainedRecovery(page, setup, recovered.result);
  expect(await readPendingRun(action)).toEqual({ ...terminalRun, unresolved: false });
  await assertPendingQuiescent(page, wire, setup);

  const settlement = await settlePendingAtQuota(page), acked = await canonicalEvidence(page);
  expect(await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action))
    .toEqual({ ...recovered, duplicate: true });
  expect(recoveryEnvelope(wire, action).serialized).toBe(original.serialized);
  expect(await assertRetainedRecovery(page, setup, recovered.result)).toEqual(retained);
  expect(await canonicalEvidence(page)).toEqual(acked);
  const final = await assertPendingQuiescent(page, wire, setup);
  await info.attach('pending-recovery-at-quota.json', { body: JSON.stringify({ original, terminalRun, recovered, retained,
    settlement, final }, null, 2), contentType: 'application/json' });
});

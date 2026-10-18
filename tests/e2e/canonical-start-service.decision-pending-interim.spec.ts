import { test, expect } from './canonical-start-service.decision.test';
import { retainPendingSuccessor, reloadPendingSuccessor } from './canonical-start-service.pending.steps';
import { readPendingRun, waitPendingRunTerminal } from './canonical-start-service.pending-run';
import { fundedQuota } from './canonical-start-service.decision-stop.steps';
import { assertNoEffectResult, assertPendingQuiescent, assertRetainedRecovery, canonicalEvidence,
  recoveryEnvelope, settlePendingAtQuota } from './canonical-start-service.pending-recovery.steps';
import { equivalentOperationWire } from '../../src/persistence/canonical/agentica/operation.wire';

test('production unresolved interim custody is replaced by proven no-effect without execution and both ACKs at quota', async ({ page, wire }, info) => {
  const setup = await retainPendingSuccessor(page, wire, info), { action } = setup;
  await reloadPendingSuccessor(page, wire, setup);
  await fundedQuota(page);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const terminalRun = await waitPendingRunTerminal(action), before = await canonicalEvidence(page);
  const requests = wire.http.length;
  const hook = await page.evaluate(action => window.canonicalStartService.producePendingInterim(action), action);
  expect(hook.hostCommands).toEqual([]); expect(hook.transactions.length).toBeGreaterThan(0);
  expect(hook.transactions.every(mode => mode === 'readonly')).toBe(true);
  expect(hook.result).toEqual({ actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
    disposition: 'unresolved', beforeRevision: action.expectedRevision, afterRevision: action.expectedRevision,
    evidenceId: action.actionId, summary: 'No retained completion. Reconcile the original action; do not repeat its effect.' });
  expect(wire.http).toHaveLength(requests); expect(await canonicalEvidence(page)).toEqual(before);

  const serialized = JSON.stringify({ hostId: 'maze-battle', sessionId: action.sessionId, result: hook.result });
  const posted = await page.evaluate(body => window.canonicalStartService.postPendingRecovery(body), serialized);
  expect(posted).toEqual({ status: 200, body: { actionId: action.actionId, resolved: false, duplicate: false } });
  expect(recoveryEnvelope(wire, action).serialized).toBe(serialized);
  const interim = await page.evaluate(action => window.canonicalStartService.readExactPendingCustody(action), action);
  const original = setup.custody.entries[0];
  expect(interim).toEqual({ ...original, result: interim.result, resultHash: interim.resultHash, updatedAt: interim.updatedAt });
  expect(interim.recoveryRetention).toBe('reserved');
  expect(equivalentOperationWire(interim.result, hook.result, 'result')).toBe(true);
  expect(interim.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action))
    .toEqual({ entries: [interim], canonical: null, reconciled: null });
  expect(await readPendingRun(action)).toEqual(terminalRun);
  expect(await canonicalEvidence(page)).toEqual(before);
  await assertPendingQuiescent(page, wire, setup);

  wire.expectedRefusals.push({ method: 'POST', path: '/api/operations/stop-decision', status: 409, code: 'session.unresolved' });
  expect(await page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return ''; }
    catch (error) { return String((error as { code?: unknown }).code ?? ''); }
  })).toBe('session.unresolved');
  const recovered = await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action);
  expect(recovered).toEqual({ status: 'action-reconciled', result: recovered.result, duplicate: false,
    rootClear: 'unknown', sessionClear: 'unknown' });
  await assertNoEffectResult(page, setup, recovered.result);
  const retained = await assertRetainedRecovery(page, setup, recovered.result);
  expect(retained.resultHash).not.toBe(interim.resultHash);
  expect(await readPendingRun(action)).toEqual({ ...terminalRun, unresolved: false });
  expect(await canonicalEvidence(page)).toEqual(before);
  await assertPendingQuiescent(page, wire, setup);

  const settlement = await settlePendingAtQuota(page), acked = await canonicalEvidence(page);
  expect(await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action))
    .toEqual({ ...recovered, duplicate: true });
  expect(await assertRetainedRecovery(page, setup, recovered.result)).toEqual(retained);
  expect(await canonicalEvidence(page)).toEqual(acked);
  const final = await assertPendingQuiescent(page, wire, setup);
  await info.attach('pending-recovery-interim-unresolved.json', { body: JSON.stringify({ terminalRun, hook, serialized,
    posted, interim, recovered, retained, settlement, final }, null, 2), contentType: 'application/json' });
});

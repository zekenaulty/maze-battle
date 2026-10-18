import { test, expect, service, serviceProof } from './canonical-start-service.decision.test';
import { retainPendingSuccessor, reloadPendingSuccessor } from './canonical-start-service.pending.steps';
import { readPendingRun, waitPendingRunTerminal } from './canonical-start-service.pending-run';
import { fundedQuota } from './canonical-start-service.decision-stop.steps';
import { assertNoEffectResult, assertPendingQuiescent, assertRetainedRecovery, canonicalEvidence,
  recoveryEnvelope, settlePendingAtQuota, tryPendingRecovery } from './canonical-start-service.pending-recovery.steps';
import { refuseChangedRecovery, replayExactRecovery } from './canonical-start-service.pending-replay.steps';

test('lost production HTTP recovery reply replays exact bytes across service restart and refuses changed bodies', async ({ page, wire }, info) => {
  const setup = await retainPendingSuccessor(page, wire, info), { action } = setup;
  await reloadPendingSuccessor(page, wire, setup);
  await fundedQuota(page);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const terminalRun = await waitPendingRunTerminal(action), before = await canonicalEvidence(page);
  expect((await tryPendingRecovery(page, action, true)).error!.message).toContain('discarded the real successful pending-recovery reply');
  const lost = await page.evaluate(() => window.canonicalStartService.readLostPendingReply());
  const original = recoveryEnvelope(wire, action);
  expect(lost).toEqual({ serializedBody: original.serialized, status: 200,
    reply: { actionId: action.actionId, resolved: true, duplicate: false } });
  await assertNoEffectResult(page, setup, original.envelope.result);
  const retained = await assertRetainedRecovery(page, setup, original.envelope.result);
  expect(await readPendingRun(action)).toEqual({ ...terminalRun, unresolved: false });
  expect(await canonicalEvidence(page)).toEqual(before);
  await replayExactRecovery(page, original.serialized, action.actionId);
  const recovered = await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action);
  expect(recovered).toEqual({ status: 'action-reconciled', result: original.envelope.result, duplicate: true,
    rootClear: 'unknown', sessionClear: 'unknown' });
  expect(recoveryEnvelope(wire, action).serialized).toBe(original.serialized);
  const liveRefusals = await refuseChangedRecovery(page, wire, setup, original.serialized, false);
  await assertPendingQuiescent(page, wire, setup);

  const beforeRestart = await serviceProof(), restarted = await service.restart();
  expect(restarted.processId).not.toBe(beforeRestart.processId); expect(restarted.created).toBe(0);
  expect(await assertRetainedRecovery(page, setup, recovered.result)).toEqual(retained);
  await replayExactRecovery(page, original.serialized, action.actionId);
  expect(await page.evaluate(action => window.canonicalStartService.recoverPendingNoEffect(action), action)).toEqual(recovered);
  expect(recoveryEnvelope(wire, action).serialized).toBe(original.serialized);
  const restartedRefusals = await refuseChangedRecovery(page, wire, setup, original.serialized, true);
  expect(await canonicalEvidence(page)).toEqual(before);
  expect(await assertRetainedRecovery(page, setup, recovered.result)).toEqual(retained);
  await assertPendingQuiescent(page, wire, setup, restarted);

  const settlement = await settlePendingAtQuota(page), acked = await canonicalEvidence(page);
  await replayExactRecovery(page, original.serialized, action.actionId);
  expect(await assertRetainedRecovery(page, setup, recovered.result)).toEqual(retained);
  expect(await canonicalEvidence(page)).toEqual(acked);
  const final = await assertPendingQuiescent(page, wire, setup, restarted);
  await info.attach('pending-recovery-lost-reply-restart.json', { body: JSON.stringify({ original, lost, retained, liveRefusals,
    beforeRestart, restarted, restartedRefusals, settlement, final }, null, 2), contentType: 'application/json' });
});

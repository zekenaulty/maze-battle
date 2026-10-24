import { expect, type Page } from '@playwright/test';
import { serviceProof } from './canonical-start-service.decision.test';
import { equivalentOperationWire } from '../../src/persistence/canonical/agentica/operation.wire';

export async function decisionAckError(page: Page) {
  return page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return ''; }
    catch (error) { return String(error); }
  });
}

export async function refuseBeforeRootAck(page: Page) {
  const before = await page.evaluate(() => window.canonicalStartService.readDecision());
  const sources = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(sources.root.acknowledgement).toBeNull();
  expect(sources.navigation.acknowledgement).toBeNull();
  expect(await decisionAckError(page)).not.toBe('');
  const after = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(after.head).toEqual(before.head); expect(after.terminal).toEqual(before.terminal);
  expect(after.head.allocations[after.operation!.operation.id]).toBeDefined();
  expect(await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence())).toEqual(sources);
}

export async function fundedQuota(page: Page, alreadyRefused = false) {
  const full = await page.evaluate(() => window.canonicalStartService.fillQuota());
  expect(full.refusal).toContain(alreadyRefused ? 'Game control unavailable' : 'quota');
  expect(full.view.controlled).toBe(false);
  const quota = full.head.quota;
  expect(quota.limitBytes).toBe(full.admissionBytes + quota.reserveBytes + quota.reservedBytes);
  expect(full.ordinaryRemaining).toBe(0);
  expect(quota.usedBytes).toBe(full.actualStoredBytes);
  expect(quota.privateCapacity).toEqual(full.before.quota.privateCapacity);
  expect(full.head.allocations).toEqual(full.before.allocations);
  return full.head;
}

export async function dischargeAfterRootStop(page: Page, alreadyRefused = false) {
  const before = await page.evaluate(() => window.canonicalStartService.readDecision());
  const sources = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  const entries = await page.evaluate(() => window.canonicalStartService.remoteDecision());
  const remote = entries.find(entry => entry.action.actionId === before.terminal!.identity.action.actionId)!;
  expect(equivalentOperationWire(remote.latestEvent, before.intent!.data.event, 'event')).toBe(true);
  expect(sources.root.operation.state).toBe('acknowledged');
  expect(sources.root.acknowledgement!.source.input).toMatchObject({ proof: {
    kind: 'launch-stop', terminal: { reason: 'interrupted', usage: null, usageUnknown: true },
  } });
  expect(before.operation!.operation.state).toBe('settled');
  expect(before.head.allocations[before.operation!.operation.id]).toBeDefined();
  await fundedQuota(page, alreadyRefused);
  const full = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  const after = await page.evaluate(() => window.canonicalStartService.readDecision());
  const discharged = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(after.operation!.operation.state).toBe('acknowledged');
  expect(after.head.revision).toBe(full.head.revision + 1);
  expect(after.head.quota.reservations).toBe(full.head.quota.reservations - 1);
  expect(after.head.allocations[before.operation!.operation.id]).toBeUndefined();
  expect(after.head.checkpoint).toEqual(full.head.checkpoint);
  expect(discharged.navigation.terminal).toEqual(sources.navigation.terminal);
  expect(discharged.root).toEqual(sources.root);
  expect(discharged.navigation.acknowledgement!.source.input).toMatchObject({
    operationId: before.operation!.operation.id, terminalAttemptId: sources.navigation.terminal!.source.attemptId,
    proof: { schema: 1, delivery: 'decision-root-stop', action: full.terminal!.identity.storageKey,
      original: full.terminal!.bound.original.reference, result: full.terminal!.bound.original.resultReference,
      event: full.terminal!.event, decision: { intent: before.intent!.reference, claim: before.claim?.reference ?? null,
        rootAcknowledgement: sources.root.acknowledgement!.source.attemptId },
      remote: { runId: remote.wakeRunId ?? null, activeEpoch: remote.activeEpoch, state: remote.state, usage: remote.usage,
        settledUsage: Reflect.get(remote, 'settledUsage') ?? null, stopped: remote.stopDecision != null } },
  });
  expect(discharged.navigation.operation.terminal!.disposition).toBe('completed');
  expect(after.originals).toEqual(before.originals);
  expect(after.selection).toEqual(before.selection); expect(after.wakes).toEqual(before.wakes);
  const counters = await serviceProof();
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  const retried = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(retried.head).toEqual(after.head); expect(retried.terminal).toEqual(after.terminal);
  expect(await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence())).toEqual(discharged);
  expect(await serviceProof()).toEqual(counters);
  return { before, after, discharged };
}

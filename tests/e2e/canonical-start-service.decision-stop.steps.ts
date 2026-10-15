import { expect, type Page } from '@playwright/test';
import { serviceProof } from './canonical-start-service.decision.test';

export async function decisionAckError(page: Page) {
  return page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return ''; }
    catch (error) { return String(error); }
  });
}

export async function fundedQuota(page: Page) {
  const full = await page.evaluate(() => window.canonicalStartService.fillQuota());
  expect(full.refusal).toContain('quota');
  return full.head;
}

export async function dischargeAfterRootStop(page: Page) {
  const before = await page.evaluate(() => window.canonicalStartService.readDecision());
  const sources = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(sources.root.operation.state).toBe('acknowledged');
  expect(sources.root.acknowledgement!.source.input).toMatchObject({ proof: { kind: 'launch-stop' } });
  expect(before.operation!.operation.state).toBe('settled');
  expect(before.head.allocations[before.operation!.operation.id]).toBeDefined();
  await fundedQuota(page);
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

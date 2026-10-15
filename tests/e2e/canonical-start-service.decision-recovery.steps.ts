import { expect, type Page } from '@playwright/test';
import { serviceProof } from './canonical-start-service.decision.test';
import { initialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';

export const terminalWindow = { instances: 1, createCalls: 1, refineCalls: 0, stepsPlanned: 0, emptyPlans: 1 };
export async function loseTerminalReply(page: Page) {
  const prepared = await initialDecision(page, 'terminal');
  await page.evaluate(() => window.canonicalStartService.decisionReplyAfterOutcome());
  await page.evaluate(() => window.canonicalStartService.loseDecisionReply());
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('prefix-delivered');
  const error = await pulseError(page);
  expect(error.message).toContain('discarded the real correlated decision-wake reply');
  const lost = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(lost.claim).toBeNull(); expect(lost.selection).toEqual(prepared.retained.selection);
  expect(lost.actions).toHaveLength(4); expect(lost.replies).toHaveLength(1);
  expect(lost.wakes).toEqual([prepared.retained.intent!.data.event]);
  expect((await page.evaluate(() => window.canonicalStartService.readDecisionController())).phase).toBe('recovery-required');
  expect(counterDelta(await serviceProof(), prepared.before)).toEqual({ created: 2, initial: scriptedWindow, successor: terminalWindow });
  return { ...prepared, lost };
}
export function pulseError(page: Page) {
  return page.evaluate(async () => {
    try { await window.canonicalStartService.pulseDecision(); return { message: '', code: '' }; }
    catch (error) { return { message: String(error), code: String((error as { code?: unknown }).code ?? '') }; }
  });
}
export async function stopSettledDecision(page: Page) {
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toMatchObject({ status: 'locally-stopped' });
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toMatchObject({ status: 'navigation-acknowledged' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const state = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(state.operation!.operation.state).toBe('acknowledged'); expect(state.launch!.guard.state).toBe('acknowledged');
  expect(state.originals).toHaveLength(4); expect(state.statuses.filter(item => item.state.endsWith('.error'))).toEqual([]);
  return state;
}

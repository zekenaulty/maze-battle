import { expect, type Page } from '@playwright/test';
import { serviceProof } from './canonical-start-service.decision.test';
import type { ServiceProof, PlannerWindowProof } from '../agentica-start-service/service.mjs';
import type { DecisionScriptMode } from './canonical-start-service.decision-script';

export function counterDelta(after: ServiceProof, before: ServiceProof) {
  const window = (name: 'initial' | 'successor') => Object.fromEntries(
    Object.keys(after.decision[name]).map(key => [key,
      after.decision[name][key as keyof PlannerWindowProof] - before.decision[name][key as keyof PlannerWindowProof]]));
  return { created: after.decision.created - before.decision.created, initial: window('initial'), successor: window('successor') };
}
export const scriptedWindow = { instances: 1, createCalls: 1, refineCalls: 3, stepsPlanned: 4, emptyPlans: 0 };
export const absentWindow = { instances: 0, createCalls: 0, refineCalls: 0, stepsPlanned: 0, emptyPlans: 0 };

export async function completeInitialDecision(page: Page, mode: DecisionScriptMode = 'navigation') {
  const before = await serviceProof();
  await page.evaluate(mode => window.canonicalStartService.startDecision(mode), mode);
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readDecision())).messages
    .filter(item => item.window === 'initial').some(item => item.message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  for (const status of ['confirmed', 'custody-confirmed', 'advanced', 'locally-settled', 'decision-required'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecisionNavigation())).status).toBe(status);
  const original = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(original.operation!.progress).toMatchObject({ status: 'arrived', steps: 1 });
  expect(original.terminal!.event.kind).toBe('decision');
  expect(original.launch!.binding.start.limits!.maxPlanContinuations).toBe(1);
  expect(counterDelta(await serviceProof(), before)).toEqual({ created: 1, initial: scriptedWindow, successor: absentWindow });
  return { before, original };
}

export async function initialDecision(page: Page, mode: DecisionScriptMode = 'navigation') {
  const { before, original } = await completeInitialDecision(page, mode);
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  const prepared = await page.evaluate(() => window.canonicalStartService.prepareDecision());
  const retained = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(retained.intent!.data.publication).toEqual(prepared.publication);
  expect(retained.intent!.data.adoption).toBeNull(); expect(retained.claim).toBeNull();
  expect(retained.wakes).toEqual([]);
  expect(counterDelta(await serviceProof(), before)).toEqual({ created: 1, initial: scriptedWindow, successor: absentWindow });
  return { before, original, retained };
}

export async function claimDecision(page: Page) {
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('prefix-delivered');
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('claimed');
}

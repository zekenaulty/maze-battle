import { expect, type Page } from '@playwright/test';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';

export async function reloadDecision(page: Page, reference: ProtocolRef) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalStartService);
  expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type)).toBe('reload');
  await page.evaluate(() => window.canonicalStartService.boot());
  await page.evaluate(reference => window.canonicalStartService.restoreDecision(reference), reference);
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  return page.evaluate(() => window.canonicalStartService.readDecision());
}

export async function settleAdoptedNavigation(page: Page) {
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toMatchObject({ status: 'locally-stopped' });
  await page.evaluate(() => window.canonicalStartService.cancelDecisionSuccessor());
  for (let pulse = 0; pulse < 3; pulse++) {
    const result = await page.evaluate(() => window.canonicalStartService.pulseDecisionSuccessor());
    if (result.status === 'terminal-acknowledged') break;
    expect(result.status).toBe('terminal-prefix-delivered');
  }
  const child = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(child.operation!.operation.state).toBe('acknowledged');
  await expect.poll(() => page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toMatchObject({ status: 'navigation-acknowledged' });
  const settled = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(settled.launch!.guard.state).toBe('acknowledged');
  for (const id of [settled.launch!.guard.id, settled.operation!.operation.id, child.operation!.operation.id])
    expect(settled.head.allocations[id]).toBeUndefined();
  return settled;
}

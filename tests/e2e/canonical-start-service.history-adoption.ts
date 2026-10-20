import type { Page } from '@playwright/test';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';

/** Actual reload and inspected UI adoption, without injecting a new session or decision. */
export async function adoptHistory(page: Page, wire: DecisionWire,
  before: Awaited<ReturnType<typeof window.canonicalStartService.snapshot>>) {
  const counters = await serviceProof();
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Test reader attaches to the reloaded App-owned session only.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
  });
  const reloaded = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(reloaded.head.owner).not.toBe(before.head.owner);
  expect(reloaded.head.epoch).toBeGreaterThan(before.head.epoch);
  for (const key of ['gameId', 'generation', 'checkpoint'] as const) expect(reloaded.head[key]).toEqual(before.head[key]);
  for (const area of ['world', 'knowledge'] as const) expect(reloaded.head.roots[area]).toEqual(before.head.roots[area]);
  expect(reloaded.launch).toEqual(before.launch);
  expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt'].includes(frame.type))).toEqual([]);
  expect(await serviceProof()).toEqual(counters);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  const quiet = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  const traffic = { sent: wire.sent.length, http: wire.http.length };
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByRole('button', { name: 'Adopt and continue', exact: true })).toBeEnabled();
  await expect(recovery).toContainText('decision-history');
  expect(await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence())).toEqual(quiet);
  expect({ sent: wire.sent.length, http: wire.http.length }).toEqual(traffic);
  expect(await serviceProof()).toEqual(counters);
  await recovery.getByRole('button', { name: 'Adopt and continue', exact: true }).click();
  await expect(dialog).toBeVisible();
  return reloaded;
}

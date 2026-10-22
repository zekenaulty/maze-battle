import type { Page } from '@playwright/test';
import { attachCorpusApp } from './canonical-start-service.corpus-recovery.steps';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';

export async function adoptJourney(page: Page, wire: DecisionWire) {
  const before = await page.evaluate(() => window.canonicalStartService.snapshot());
  const counters = await serviceProof(), sent = wire.sent.length;
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachCorpusApp(page);
  const reloaded = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(reloaded.head.owner).not.toBe(before.head.owner);
  expect(reloaded.head.epoch).toBeGreaterThan(before.head.epoch);
  for (const key of ['gameId', 'generation', 'checkpoint'] as const) expect(reloaded.head[key]).toEqual(before.head[key]);
  for (const area of ['world', 'knowledge'] as const) expect(reloaded.head.roots[area]).toEqual(before.head.roots[area]);
  expect(reloaded.launch).toEqual(before.launch);
  expect(wire.sent.slice(sent)).toEqual([]); expect(await serviceProof()).toEqual(counters);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery).toContainText('room-journey');
  await expect(recovery.getByRole('button', { name: 'Adopt and continue', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(reloaded);
  expect(wire.sent.slice(sent)).toEqual([]); expect(await serviceProof()).toEqual(counters);
  await recovery.getByRole('button', { name: 'Adopt and continue', exact: true }).click();
  await expect(dialog).toBeVisible();
  return { before, reloaded, counters };
}

import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { expect, service, type DecisionWire } from './canonical-start-service.decision.test';
import { attachCorpusApp, corpusActions } from './canonical-start-service.corpus-recovery.steps';

export async function startPreackJourney(page: Page, cut: 'progress' | 'transfer') {
  // The offline journey policy retains at most two roots. Isolate this case before any launch.
  // This is fixture setup, not evidence of recovery across a service restart.
  await service.restart();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const genesis = await page.evaluate(async () => {
    // @ts-expect-error Genesis only, never sight or planner routing input.
    const { initializeCorpus }: typeof import('./canonical-corpus.initialize') = await import('/tests/e2e/canonical-corpus.initialize.ts');
    return initializeCorpus('A', 'preack-journey-genesis');
  });
  expect(genesis.initialized.head.checkpoint.knowledge).toBeNull();
  await page.goto('/?corpusProof=1&roomJourneyProof=1&activeJourneyProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible(); await attachCorpusApp(page);
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Public guild offer; hidden target remains independent audit output.
    const { acceptAppSurvey }: typeof import('./canonical-start-service.corpus-fixture') = await import('/tests/e2e/canonical-start-service.corpus-fixture.ts');
    return acceptAppSurvey();
  });
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(setup.target.contractId);
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill(
    'Scout at least three earned rooms without collecting. Return to the entrance, choose the disclosed chest room from a later map page, travel there, collect once, then return with the survey seal.');
  if (cut === 'progress') await arm(page, 'progress');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  return { genesis, setup };
}

export async function selectedJourney(page: Page, wire: DecisionWire) {
  const selected = () => corpusActions(wire).find((a, i, all) => a.capabilityId === 'maze.navigate' && all[i - 1]?.arguments.scope === 'connections');
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  for (let window = 0; window < 10; window++) {
    await expect.poll(async () => selected() ? 'selected' : await dialog.getByRole('status')
      .filter({ hasText: /^(decision|failed|blocked|recovery)$/ }).count() ? 'terminal' : 'running', { timeout: 60_000 }).not.toBe('running');
    if (selected()) return selected()!;
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const count = corpusActions(wire).length;
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => corpusActions(wire).length).toBeGreaterThan(count);
  }
  throw Error('Bounded public journey did not select its known-room destination.');
}

export const evidence = (page: Page, action: AgenticaAction) => page.evaluate(async action => {
  // @ts-expect-error Read-only identity/custody audit, never controller input.
  const { activeJourneyEvidence }: typeof import('./canonical-start-service.active-journey-evidence') = await import('/tests/e2e/canonical-start-service.active-journey-evidence.ts');
  return activeJourneyEvidence(action);
}, action);
export const snapshot = (page: Page) => page.evaluate(() => window.canonicalStartService.snapshot());
export const fault = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error Raw test-only transport evidence.
  const { preackFault }: typeof import('./canonical-start-service.corpus-preack.fault') = await import('/tests/e2e/canonical-start-service.corpus-preack.fault.ts');
  return preackFault();
});
export const arm = (page: Page, kind: 'progress' | 'transfer', actionId?: string) => page.evaluate(async ({ kind, actionId }) => {
  // @ts-expect-error Transport cut only, no game or service mutation.
  const { holdPreack }: typeof import('./canonical-start-service.corpus-preack.fault') = await import('/tests/e2e/canonical-start-service.corpus-preack.fault.ts');
  holdPreack(kind, actionId);
}, { kind, actionId });

export async function reloadJourney(page: Page) {
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('activeJourneyProof'); history.replaceState(null, '', url); });
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible(); await attachCorpusApp(page);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  return page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
}

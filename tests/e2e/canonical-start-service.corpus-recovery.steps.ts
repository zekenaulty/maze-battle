import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { ChestTarget } from './canonical-start-service.chest-fixture';
import { expect, type DecisionWire } from './canonical-start-service.decision.test';

export const corpusActions = (wire: DecisionWire) => wire.received.filter(({ frame }) => frame.type === 'action.request')
  .map(({ frame }) => frame.payload as AgenticaAction);
export async function attachCorpusApp(page: Page) {
  await page.evaluate(async () => {
    // @ts-expect-error Isolated instrumentation attaches to the actual App session.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
  });
}
export async function startCorpus(page: Page, variant: 'A' | 'B') {
  await page.goto('/tests/e2e/canonical-start-service.html');
  await page.evaluate(async variant => {
    // @ts-expect-error Authored genesis only, no earned knowledge or route.
    const { initializeCorpus }: typeof import('./canonical-corpus.initialize') = await import('/tests/e2e/canonical-corpus.initialize.ts');
    await initializeCorpus(variant, 'corpus-recovery-genesis');
  }, variant);
  await page.goto('/?corpusProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachCorpusApp(page);
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Ordinary guild acceptance with no discovery movement.
    const { acceptAppSurvey }: typeof import('./canonical-start-service.corpus-fixture') = await import('/tests/e2e/canonical-start-service.corpus-fixture.ts');
    return acceptAppSurvey();
  });
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(setup.target.contractId);
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Locate the survey seal in an ordinary chest, retrieve it, then return to the entrance.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  return { setup, dialog };
}
export const corpusEffects = (page: Page, target: ChestTarget) => page.evaluate(async target => {
  // @ts-expect-error Privileged audit output only, never planner input or movement routing.
  const { chestEffects }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
  return chestEffects(target);
}, target);

export async function reachChestBoundary(page: Page, wire: DecisionWire, collected: boolean) {
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  for (let window = 0; window < 8; window++) {
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const actions = corpusActions(wire), last = actions.at(-1)!;
    if (last.capabilityId === (collected ? 'maze.interact' : 'maze.navigate')) return last;
    expect(last.capabilityId).not.toBe('maze.interact');
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => corpusActions(wire).length).toBeGreaterThan(actions.length);
  }
  throw Error('Cold-start journey did not reach its explicit chest boundary.');
}

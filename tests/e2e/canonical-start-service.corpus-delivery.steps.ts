import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { matchesQuestItem } from '../../src/domain/quests/questItems';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';
import { attachCorpusApp, corpusActions, corpusEffects } from './canonical-start-service.corpus-recovery.steps';

export const custody = (page: Page, action: AgenticaAction) => page.evaluate(async action => {
  // @ts-expect-error Exact-original read-only audit, never planner input.
  const { corpusCustody }: typeof import('./canonical-start-service.corpus-recovery.evidence') = await import('/tests/e2e/canonical-start-service.corpus-recovery.evidence.ts');
  return corpusCustody(action);
}, action);
export const results = (page: Page, actions: AgenticaAction[]) => page.evaluate(async actions => {
  // @ts-expect-error Historical result source audit only.
  const { returnEvidence }: typeof import('./canonical-start-service.return-evidence') = await import('/tests/e2e/canonical-start-service.return-evidence.ts');
  return returnEvidence(actions);
}, actions);
export const fault = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error Fixture transport evidence, not actor input.
  const { deliveryFault }: typeof import('./canonical-start-service.corpus-delivery.fault') = await import('/tests/e2e/canonical-start-service.corpus-delivery.fault.ts');
  return deliveryFault();
});
type Effects = Awaited<ReturnType<typeof corpusEffects>>;
export const domain = (state: Effects) => ({ checkpoint: state.checkpoint,
  gameId: state.head.gameId, generation: state.head.generation, inventory: state.inventory,
  stash: state.stash, quest: state.quest, chest: state.chest,
  world: state.head.roots.world, knowledge: state.head.roots.knowledge });
export function onePackItem(state: Effects) {
  expect(state.chest.chest.opened).toBe(true);
  expect(state.questItems).toHaveLength(1); expect(state.questItems[0].quantity).toBe(1);
  expect(state.inventory.items.filter(item => matchesQuestItem(item, state.quest.quest))).toEqual(state.questItems);
  expect(state.stash.items.filter(item => matchesQuestItem(item, state.quest.quest))).toEqual([]);
}
export async function reloadRecovery(page: Page, wire: DecisionWire) {
  const counters = await serviceProof(), sent = structuredClone(wire.sent), actions = corpusActions(wire), http = wire.http.length;
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachCorpusApp(page);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await page.getByRole('dialog', { name: 'Agentic play', exact: true }).getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await expect(recovery.getByRole('button', { name: 'Check service', exact: true })).toBeEnabled();
  await expect(recovery).toContainText('Unknown');
  expect(await serviceProof()).toEqual(counters); expect(wire.sent).toEqual(sent);
  expect(corpusActions(wire)).toEqual(actions); expect(wire.http).toHaveLength(http);
  return recovery;
}
export async function replay(page: Page, actions: AgenticaAction[]) {
  const proof = await page.evaluate(async actions => {
    // @ts-expect-error Exact retained action replay through production hooks, no fresh admission.
    const { journeyReplay }: typeof import('./canonical-start-service.room-journey-evidence') = await import('/tests/e2e/canonical-start-service.room-journey-evidence.ts');
    return journeyReplay(actions);
  }, actions);
  for (const row of proof) {
    expect(row.retry.submissions).toBe(0);
    expect(row.retry.results[0].actionResult).toEqual(row.original.result);
    expect(row.retry.results[0].reconciled).toEqual(row.original.result);
    expect(row.retry.results[0].after).toEqual(row.retry.results[0].original);
  }
  return proof;
}

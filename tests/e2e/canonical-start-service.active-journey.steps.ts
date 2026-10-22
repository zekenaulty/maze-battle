import type { Page } from '@playwright/test';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';
import { attachCorpusApp, corpusActions, corpusEffects } from './canonical-start-service.corpus-recovery.steps';

export async function interruptActiveJourney(page: Page, wire: DecisionWire, phase: 'outbound' | 'return', effects: () => ReturnType<typeof corpusEffects>) {
  const selected = () => corpusActions(wire).find((action, i, all) => {
    if (action.capabilityId !== 'maze.navigate') return false;
    const previous = all[i - 1];
    if (phase === 'outbound') return previous?.arguments.scope === 'connections';
    const result = wire.sent.find(f => f.type === 'action.result' && f.payload.actionId === previous?.actionId);
    return result?.payload.observation?.data.scope === 'objective' && result.payload.observation.data.carried === 1;
  });
  await expect.poll(() => !!selected(), { timeout: 240_000 }).toBe(true);
  const action = selected()!;
  if (phase === 'return') {
    const previous = corpusActions(wire)[corpusActions(wire).indexOf(action) - 1];
    const result = wire.sent.find(f => f.type === 'action.result' && f.payload.actionId === previous.actionId)!;
    const returnTo = result.payload.observation.data.returnTo;
    expect(action.arguments).toEqual(returnTo);
  }
  await page.evaluate(id => Reflect.set(globalThis, '__activeJourneyAction', id), action.actionId);
  await page.waitForFunction(() => !!Reflect.get(globalThis, '__activeJourneyPaused'), undefined, { timeout: 30_000 });
  const evidence = () => page.evaluate(async action => {
    // @ts-expect-error Independent original/transfer evidence only, never a recovery command.
    const { activeJourneyEvidence }: typeof import('./canonical-start-service.active-journey-evidence') = await import('/tests/e2e/canonical-start-service.active-journey-evidence.ts');
    return activeJourneyEvidence(action);
  }, action);
  const before = await evidence(), snapshot = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  const beforeEffects = await effects();
  const retainedEffects = (state: Awaited<ReturnType<typeof effects>>) => ({ inventory: state.inventory, stash: state.stash,
    chest: state.chest, quest: state.quest, questItems: state.questItems });
  if (before.operation.kind !== 'navigation') throw Error('Expected active navigation.');
  expect(before.operation.progress.status).toBe('running'); expect(before.operation.progress.steps).toBeGreaterThan(0);
  expect(before.operation.progress.position).not.toEqual(before.operation.progress.binding.target);
  expect(beforeEffects.questItems).toHaveLength(phase === 'return' ? 1 : 0);
  expect(beforeEffects.chest.chest.opened).toBe(phase === 'return');
  expect(before.operation.acknowledgement).toBeTruthy(); expect(before.terminal).toBeNull(); expect(before.intent).toBeNull();
  const sent = wire.sent.length;
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('activeJourneyProof'); history.replaceState(null, '', url); });
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible(); await attachCorpusApp(page);
  const reloaded = await page.evaluate(() => window.canonicalStartService.snapshot());
  const reloadedEffects = await effects(); expect(retainedEffects(reloadedEffects)).toEqual(retainedEffects(beforeEffects));
  expect(reloaded.head.owner).not.toBe(snapshot.head.owner); expect(reloaded.head.epoch).toBeGreaterThan(snapshot.head.epoch);
  expect(reloaded.head.checkpoint).toEqual(snapshot.head.checkpoint); expect(reloaded.head.roots).toEqual(snapshot.head.roots);
  expect(reloaded.launch).toEqual(snapshot.launch); expect(wire.sent.slice(sent)).toEqual([]); expect(await serviceProof()).toEqual(counters);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByText(action.actionId, { exact: true })).toBeVisible();
  await expect(recovery.getByRole('button', { name: 'Adopt and continue', exact: true })).toHaveCount(0);
  await expect(recovery.getByRole('button', { name: 'Resume navigation', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(reloaded);
  expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sent)).toEqual([]);
  await recovery.getByRole('button', { name: 'Resume navigation', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  const arrived = await evidence();
  const arrivedEffects = await effects(); expect(retainedEffects(arrivedEffects)).toEqual(retainedEffects(beforeEffects));
  if (arrived.operation.kind !== 'navigation') throw Error('Expected retained navigation.');
  expect(arrived.original).toEqual(before.original); expect(arrived.binding).toEqual(before.binding);
  expect(arrived.operation.operation.id).toBe(before.operation.operation.id);
  expect(arrived.operation.confirmation).toEqual(before.operation.confirmation);
  for (const key of ['binding', 'startedAt', 'deadline'] as const) expect(arrived.operation.progress[key]).toEqual(before.operation.progress[key]);
  expect(arrived.operation.progress.status).toBe('arrived'); expect(arrived.operation.progress.steps).toBeGreaterThan(before.operation.progress.steps);
  expect(arrived.operation.progress.replans).toBeGreaterThan(before.operation.progress.replans);
  expect(arrived.operation.progress.replans).toBeLessThanOrEqual(4); expect(arrived.operation.progress.steps).toBeLessThanOrEqual(64);
  expect(arrived.root.binding).toEqual(before.root.binding); expect(arrived.root.grant).toEqual(before.root.grant);
  expect(arrived.root.run).toEqual(before.root.run);
  expect(arrived.intent!.data.navigationSequence).toBe(before.operation.progress.sequence);
  expect(arrived.intent!.data.event.usage).toEqual({ steps: before.operation.progress.steps, replans: before.operation.progress.replans });
  expect(arrived.ack!.data.entry.usage).toEqual(before.operation.confirmation.data.entry.usage);
  for (const kind of ['guard', 'navigation'] as const) expect(arrived.adoptions![kind].source.attemptId).toBe(`${arrived.intent!.reference.id}:${kind}`);
  expect(arrived.authority!.data).toMatchObject({ guardAdoption: arrived.adoptions!.guard.source.attemptId,
    navigationAdoption: arrived.adoptions!.navigation.source.attemptId });
  expect(arrived.terminal.event.sessionEpoch).toBe(String(reloaded.head.epoch));
  expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sent)).toEqual([]);
  return { action, before, snapshot, reloaded, arrived, counters, beforeEffects, reloadedEffects, arrivedEffects };
}

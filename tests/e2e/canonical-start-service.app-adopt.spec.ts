import { test, expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';
import { counterDelta, scriptedWindow, absentWindow } from './canonical-start-service.decision.steps';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { Locator, Page } from '@playwright/test';
import type { GameLaunchOptions } from '../../src/services/agentica/game/launch';

const lifetime = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error Native Vite module path.
  return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appLifetime();
});
async function expectProfile(panel: Locator, profile: Pick<GameLaunchOptions, 'endpoint' | 'provider' | 'limits'>) {
  const { provider, limits } = profile;
  const fields = { Endpoint: profile.endpoint, Provider: provider.provider, Model: provider.model ?? 'Not specified',
    'Step limits': `${limits.maxSteps} steps / ${limits.maxRefinements} refinements / ${limits.maxPlanContinuations} continuations`,
    Timeouts: `${limits.timeoutSeconds} s run / ${limits.actionTimeoutSeconds} s action`,
    Tokens: `${provider.contextWindowTokens} context / ${provider.maxOutputTokens} output` };
  for (const [label, value] of Object.entries(fields)) {
    await expect(panel.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]'))
      .toHaveText(value);
  }
}

async function attachReader(page: Page) {
  await page.evaluate(async () => {
    // @ts-expect-error Test-only native Vite module path; reuses the hook-owned session.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
}
async function reloadAtDecision(page: Page, wire: DecisionWire) {
  await page.goto('/?decisionProof=1'); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachReader(page); const counters = await serviceProof();
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Navigate once, then wait for my explicit adoption after reload.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(counterDelta(await serviceProof(), counters)).toEqual({ created: 1, initial: scriptedWindow, successor: absentWindow });
  // The next document uses a different configured model; adoption must use the disclosed original instead.
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await attachReader(page);
  const reloaded = await page.evaluate(() => window.canonicalStartService.snapshot());
  const reloadedLifetime = await lifetime(page);
  expect(reloadedLifetime).toEqual({ sameController: true, sameSignal: true, aborted: false, controlled: true });
  expect(reloaded.head.owner).not.toBe(before.head.owner);
  expect(reloaded.head.epoch).toBeGreaterThan(before.head.epoch);
  expect(reloaded.head.gameId).toBe(before.head.gameId);
  expect(reloaded.head.generation).toBe(before.head.generation);
  expect(reloaded.head.checkpoint).toEqual(before.head.checkpoint);
  expect(reloaded.launch).toEqual(before.launch);
  expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt'].includes(frame.type))).toEqual([]);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await expect(dialog).toContainText('observation-sequence');
  const retainedProfile = { endpoint: before.launch!.binding.endpoint, provider: before.launch!.binding.start.provider,
    limits: before.launch!.binding.start.limits };
  const configuredProfile = { ...retainedProfile, provider: { ...retainedProfile.provider, model: 'observation-sequence' },
    limits: { maxSteps: 4, maxRefinements: 3, maxPlanContinuations: 0, timeoutSeconds: 60, actionTimeoutSeconds: 10 } };
  await expectProfile(dialog, configuredProfile);
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  const quiet = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  const traffic = { sent: wire.sent.length, http: wire.http.length }, afterReloadCounters = await serviceProof();
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByRole('button', { name: 'Adopt and continue', exact: true })).toBeEnabled();
  await expectProfile(recovery, retainedProfile);
  expect(await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence())).toEqual(quiet);
  expect({ sent: wire.sent.length, http: wire.http.length }).toEqual(traffic);
  expect(await serviceProof()).toEqual(afterReloadCounters);
  return { counters, before, reloaded, reloadedLifetime, retainedProfile, configuredProfile, afterReloadCounters, dialog, recovery };
}

test('actual App explicitly adopts the inspected decision after reload without replacing root settings or custody', async ({ page, wire }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await reloadAtDecision(page, wire);
  await page.screenshot({ path: info.outputPath('agentic-adoption-offer-mobile.png') });
  await original.recovery.getByRole('button', { name: 'Adopt and continue', exact: true }).click();
  await expect(original.dialog).toBeVisible();
  await expect(original.dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
  await expect(original.dialog.getByRole('alert')).toHaveCount(0);
  await expectProfile(original.dialog, original.retainedProfile);
  await expect(original.dialog.getByRole('textbox', { name: 'Objective', exact: true }))
    .toHaveValue('Navigate once, then wait for my explicit adoption after reload.');
  await expect(original.dialog.getByRole('status').filter({ hasText: /Execution allowance exhausted\./ })).toBeVisible();
  await expect(original.dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const after = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  expect(counterDelta(counters, original.counters)).toEqual({ created: 2, initial: scriptedWindow, successor: scriptedWindow });
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload);
  expect(actions.map(action => action.capabilityId)).toEqual([
    'maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate', 'maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate',
  ]);
  const evidence: Awaited<ReturnType<typeof import('./canonical-start-service.app-evidence')['appNavigationEvidence']>> =
    await page.evaluate(async ([initial, successor]) => {
      // @ts-expect-error Native Vite module path.
      return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appNavigationEvidence(initial, successor);
    }, [actions[3], actions[7]] as unknown as AgenticaAction[]);
  expect(evidence.parent!.operation.state).toBe('acknowledged');
  expect(evidence.child!.progress).toMatchObject({ status: 'arrived', steps: 1 });
  expect(evidence.childTerminal!.event.kind).toBe('decision');
  const decision = evidence.claim!.decision;
  expect(decision.data.event).toEqual(evidence.parentTerminal!.event);
  expect(decision.data.adoption!.nextSessionEpoch).toBe(String(original.reloaded.head.epoch));
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt').map(frame => frame.payload))
    .toEqual([{ decision: decision.data.event, adoption: decision.data.adoption }]);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(evidence.guardAdoption!.source).toMatchObject({ operation: 'operation.adopt',
    attemptId: `${decision.reference.id}:guard`, expected: { owner: original.reloaded.head.owner, epoch: original.reloaded.head.epoch } });
  expect(evidence.guardAdoption!.receipt.beforeRevision).toBeGreaterThanOrEqual(evidence.claim!.row.revision);
  expect(evidence.selection!.value.data.grant).toEqual(evidence.child!.confirmation.data.binding.grant);
  expect(actions[7]).toMatchObject({ runId: evidence.claim!.data.started.runId, sessionEpoch: String(original.reloaded.head.epoch) });
  expect(after.launch!.binding).toEqual(original.before.launch!.binding);
  expect(after.launch!.grant).toEqual(original.before.launch!.grant);
  expect(after.launch!.guard).toMatchObject({ owner: original.reloaded.head.owner, epoch: original.reloaded.head.epoch });
  expect(after.launch!.guard.state).toBe('admitted');
  expect(after.launch!.guard.terminal).toBeUndefined();
  for (const key of ['gameId', 'generation', 'owner', 'epoch'] as const) expect(after.head[key]).toBe(original.reloaded.head[key]);
  expect(await lifetime(page)).toEqual(original.reloadedLifetime);
  expect(after.head.checkpoint.position).not.toEqual(original.reloaded.head.checkpoint.position);
  expect(after.head.roots.world).toEqual(original.before.head.roots.world);
  expect(Object.keys(after.head.allocations).sort()).toEqual([after.launch!.guard.id, evidence.child!.operation.id].sort());
  expect(await original.dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('agentic-adopted-mobile.png') });
  await original.dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(original.dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
  expect(await serviceProof()).toEqual(counters);
  await expectProfile(original.dialog, original.configuredProfile);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['operation.wake', 'resume'].includes(frame.type))).toEqual([]);
  await info.attach('actual-app-adoption.json', { body: JSON.stringify({ before: original.before, reloaded: original.reloaded,
    after, evidence, counters, sent: wire.sent, http: wire.http }, null, 2), contentType: 'application/json' });
});

test('actual App withdraws a displayed adoption offer when another tab takes control', async ({ page, context, wire }) => {
  const original = await reloadAtDecision(page, wire);
  const other = await context.newPage();
  try {
    await other.goto('/'); await expect(other.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Take control', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
    await expect(original.recovery.getByRole('button', { name: 'Adopt and continue', exact: true })).toHaveCount(0);
    expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt'].includes(frame.type))).toEqual([]);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(await serviceProof()).toEqual(original.afterReloadCounters);
  } finally { await other.close(); }
});

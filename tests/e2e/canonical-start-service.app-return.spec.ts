import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta } from './canonical-start-service.decision.steps';

test('actual App collects a selected quest item, returns on earned paths and proves completion', async ({ page, wire }, info) => {
  test.setTimeout(180_000);
  await page.goto('/?returnProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Instrument the actual App-owned session, not a replacement game.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
    // @ts-expect-error Ordinary guild acceptance and manual movement through earned knowledge.
    const { prepareAppChest }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return prepareAppChest();
  });
  const effects = () => page.evaluate(async target => {
    // @ts-expect-error Independent domain oracle, never exposed to the planner.
    const { chestEffects }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return chestEffects(target);
  }, setup.target);
  const actions = () => wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
  const replies = () => wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
  const evidence = () => page.evaluate(async original => {
    // @ts-expect-error Exact retained result sources and durable operation state.
    const { returnEvidence }: typeof import('./canonical-start-service.return-evidence') = await import('/tests/e2e/canonical-start-service.return-evidence.ts');
    return returnEvidence(original);
  }, actions());
  const baseline = await serviceProof();
  expect(setup.moves).toBeGreaterThan(0); expect(setup.before.questItems).toEqual([]);
  expect(setup.before.chest.chest.opened).toBe(false); expect(wire.sent).toEqual([]);
  try {
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(setup.target.contractId);
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Collect the selected quest item, return to the earned town entrance, and ask the game to verify completion.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    expect(actions().map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.interact']);
    const collected = await effects(), launch = (await page.evaluate(() => window.canonicalStartService.snapshot())).launch!;
    expect(collected.questItems).toHaveLength(1); expect(collected.questItems[0].quantity).toBe(1);
    expect(collected.quest.quest.status).toBe('complete'); expect(collected.chest.chest.opened).toBe(true);
    expect(collected.checkpoint.position).toEqual(setup.target.at);
    expect(replies().every(r => !r.completion)).toBe(true);
    const initialCounters = await serviceProof();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    expect(await serviceProof()).toEqual(initialCounters);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => actions().length).toBe(4);
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    expect(actions().slice(2).map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.navigate']);
    expect(actions()[2].arguments).toEqual({ scope: 'objective' });
    const pending = replies().find(r => r.actionId === actions()[2].actionId)!;
    expect(pending.observation.data).toMatchObject({ scope: 'objective', status: 'pending', carried: 1, atReturn: false });
    expect(pending.completion).toBeUndefined();
    expect(actions()[3].arguments).toEqual(pending.observation.data.returnTo);
    const returned = await effects(), beforeCheck = await evidence(), travel = beforeCheck[3].operation;
    if (travel?.kind !== 'navigation' || travel.progress.binding.kind !== 'known-destination') throw Error('Missing original return navigation.');
    expect(travel.progress.status).toBe('arrived'); expect(travel.progress.steps).toBeGreaterThan(0);
    expect(returned.checkpoint.position).toEqual(travel.progress.binding.target);
    expect(returned.checkpoint.mode).toBe('manual');
    for (const field of ['inventory', 'stash', 'quest', 'chest', 'questItems'] as const) expect(returned[field]).toEqual(collected[field]);
    expect(returned.head.roots.world).toEqual(collected.head.roots.world);
    await info.attach('return-travel.json', { body: JSON.stringify({ setup, collected, returned, beforeCheck }, null, 2), contentType: 'application/json' });
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^satisfied$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Stop Agentic play', exact: true })).toBeEnabled();
    await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'outcome' && frame.runId === actions()[4]?.runId)).toBe(true);
    const final = await effects(), proof = await evidence(), results = replies(), completion = results.at(-1)!;
    expect(actions()).toHaveLength(5); expect(actions()[4].arguments).toEqual({ scope: 'objective' });
    expect(completion).toMatchObject({ disposition: 'applied', completion: {
      objectiveId: launch.binding.start.objectiveId, evidenceId: completion.evidenceId,
    }, observation: { data: { scope: 'objective', status: 'satisfied', carried: 1, atReturn: true } } });
    expect(proof[4].source.objective).toMatchObject({ publication: launch.binding.publication,
      evidence: { quest: { packCount: 1, stashCount: 0 } } });
    expect(proof[4].source.objective!.evidence.arrival).not.toBeNull();
    expect(proof[3].operation!.operation.state).toBe('acknowledged');
    for (const field of ['inventory', 'stash', 'quest', 'chest', 'questItems', 'checkpoint'] as const) expect(final[field]).toEqual(returned[field]);
    for (const area of ['world', 'knowledge'] as const) expect(final.head.roots[area]).toEqual(returned.head.roots[area]);
    for (const field of ['generation', 'gameId', 'owner', 'epoch'] as const) expect(final.head[field]).toBe(setup.before.head[field]);
    expect(Object.keys(final.head.allocations)).toEqual([launch.guard.id]);
    const counters = await serviceProof();
    expect(counterDelta(counters, baseline)).toEqual({ created: 3,
      initial: { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 },
      successor: { instances: 2, createCalls: 2, refineCalls: 1, stepsPlanned: 3, emptyPlans: 0 } });
    expect(counters.paidProviderCalls).toBe(0);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(2);
    expect(results.filter(r => r.completion)).toHaveLength(1);
    expect(wire.received.filter(({ frame }) => frame.type === 'outcome').map(({ frame }) =>
      (frame.payload as { outcome: { status: string; stopReason: string } }).outcome)).toEqual([
      expect.objectContaining({ status: 'partiallyComplete', stopReason: 'partial' }),
      expect.objectContaining({ status: 'partiallyComplete', stopReason: 'partial' }),
      expect.objectContaining({ status: 'succeeded', stopReason: 'complete' }),
    ]);
    expect(results.every(r => !Object.hasOwn(r, 'objective'))).toBe(true);
    expect(JSON.stringify(results)).not.toContain(setup.target.contractId);
    await page.screenshot({ path: info.outputPath('actual-app-return-satisfied.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await dialog.boundingBox();
    expect(mobile).not.toBeNull();
    expect(mobile!.x).toBeGreaterThanOrEqual(0); expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
    expect(mobile!.y).toBeGreaterThanOrEqual(0); expect(mobile!.y + mobile!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath('actual-app-return-mobile.png') });
    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const released = await effects();
    expect(released.head.allocations).toEqual({}); expect(released.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
    expect(released.questItems).toEqual(collected.questItems); expect(await evidence()).toEqual(proof);
    expect(await serviceProof()).toEqual(counters);
    await info.attach('return-completion-proof.json', { body: JSON.stringify({ final, released, proof, baseline, counters,
      sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses }, null, 2), contentType: 'application/json' });
  } finally {
    await info.attach('return-final-state.json', { body: JSON.stringify({ state: await effects().catch(String),
      snapshot: await page.evaluate(() => window.canonicalStartService.snapshot()).catch(String), counters: await serviceProof(),
      sent: wire.sent, received: wire.received, alerts: await page.getByRole('alert').allTextContents() }, null, 2), contentType: 'application/json' });
  }
});

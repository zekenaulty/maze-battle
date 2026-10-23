import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';

test('actual App explicitly queries an accepted quest and its opaque detail without hidden targets or gameplay effects', async ({ page, wire }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?journalProof=1'); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Attach to the actual hook-owned session.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
    // @ts-expect-error Ordinary shared guild acceptance and earned movement, never planner input.
    const { prepareAppChest }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return prepareAppChest();
  });
  const baseline = await serviceProof(), before = await page.evaluate(() => window.canonicalStartService.snapshot());
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog).toContainText('decision-journal');
  expect(wire.sent).toEqual([]); expect(await serviceProof()).toEqual(baseline);
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Read my accepted quest journal and one selected detail. Park on my original tile afterward. Do not collect, return, claim a reward or complete an objective.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
  const results = wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
  expect(actions.map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.navigate']);
  expect(results.map(r => r.disposition)).toEqual(['applied', 'applied', 'applied']);
  expect(actions[0].arguments).toEqual({ scope: 'quests', status: 'active' });
  const list = results[0].observation.data, selected = list.quests[0], detail = results[1].observation.data.quest;
  expect(list).toMatchObject({ scope: 'quests', floor: 1, status: 'active' }); expect(list.quests).toHaveLength(1);
  expect(actions[1].arguments).toEqual({ scope: 'quest', target: selected.target });
  expect(detail).toMatchObject({ title: setup.before.quest.quest.title, status: 'active', description: setup.before.quest.quest.description,
    targetName: setup.before.quest.quest.targetRoomName, task: { objective: 'fetch', progress: 0, required: 1,
      itemName: setup.before.quest.quest.task.item!.displayName }, reward: setup.before.quest.quest.reward });
  for (const hidden of [setup.target.contractId, setup.before.quest.quest.targetRoomId, setup.before.quest.quest.originRoomId,
    setup.before.quest.quest.task.item!.token, setup.before.quest.quest.task.item!.baseId]) {
    expect(JSON.stringify([list, detail])).not.toContain(`"${hidden}"`);
  }
  expect(list).not.toHaveProperty('after'); expect(detail).not.toHaveProperty('targetRoomId');
  const after = await page.evaluate(() => window.canonicalStartService.snapshot()), launch = after.launch!;
  expect(launch.binding.start.observation.data).toMatchObject({ scope: 'actor' });
  expect(launch.binding.start.observation.data).not.toHaveProperty('quests');
  const actor = launch.binding.start.observation.data.actor as Record<string, unknown>;
  expect(actions[2].arguments).toEqual({ level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
  const evidence = await page.evaluate(async ({ ids, selected }) => {
    // Inspect original canonical results, not provider inputs.
    const { prepareAction }: typeof import('../../src/persistence/canonical/agentica/actions') = await import('/src/persistence/canonical/agentica/actions.ts');
    const { readCanonical }: typeof import('../../src/persistence/canonical/read') = await import('/src/persistence/canonical/read.ts');
    // @ts-expect-error Same game state oracle as the chest proof.
    const { chestEffects }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    const prepared = await Promise.all(ids.slice(0, 2).map(prepareAction));
    const records = (await readCanonical(async pages => {
      const rows = [];
      for (const id of prepared) rows.push(await pages.get('execution', `${id.storageKey}/result`));
      return rows;
    })).value;
    return { effects: await chestEffects(selected), records };
  }, { ids: actions, selected: setup.target });
  expect(evidence.records.every(row => row && typeof row.value === 'object' && row.value !== null && 'query' in row.value)).toBe(true);
  expect(JSON.stringify(results)).not.toContain('"query"'); expect(JSON.stringify(results)).not.toContain('recordWitness');
  const { head: _head, ...domain } = evidence.effects, { head: _beforeHead, ...beforeDomain } = setup.before;
  expect(domain).toEqual(beforeDomain);
  expect(after.head.checkpoint).toEqual(before.head.checkpoint);
  for (const area of ['world', 'knowledge'] as const) expect(after.head.roots[area]).toEqual(before.head.roots[area]);
  const counters = await serviceProof();
  expect(counterDelta(counters, baseline)).toEqual({ created: 1,
    initial: { instances: 1, createCalls: 1, refineCalls: 2, stepsPlanned: 3, emptyPlans: 0 }, successor: absentWindow });
  expect(counters.paidProviderCalls).toBe(0);
  await page.screenshot({ path: info.outputPath('actual-app-journal-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('actual-app-journal-mobile.png') });
  await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: /terminal prefix delivered/ })).toBeVisible();
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: /acknowledged \(decision\)/ })).toBeVisible();
  await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  const final = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(final.head.allocations).toEqual({}); expect(final.head.quota.reservations).toBe(0);
  expect(final.head.checkpoint).toEqual(before.head.checkpoint);
  for (const area of ['world', 'knowledge'] as const) expect(final.head.roots[area]).toEqual(before.head.roots[area]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
  expect(await serviceProof()).toEqual(counters);
  await info.attach('actual-app-journal-proof.json', { body: JSON.stringify({ setup, before, after, final, actions, results, evidence,
    baseline, counters, sent: wire.sent, received: wire.received, http: wire.http }, null, 2), contentType: 'application/json' });
});

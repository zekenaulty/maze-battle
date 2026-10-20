import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta } from './canonical-start-service.decision.steps';

for (const variant of ['A', 'B'] as const) test(`${variant}: actual App cold-start survey adapts, collects and returns through the real service`, async ({ page, wire }, info) => {
  test.setTimeout(300_000);
  await page.goto('/tests/e2e/canonical-start-service.html');
  await page.evaluate(async variant => {
    // @ts-expect-error Isolated fresh authored topology, not knowledge or an alternate game.
    const { initializeCorpus }: typeof import('./canonical-corpus.initialize') = await import('/tests/e2e/canonical-corpus.initialize.ts');
    await initializeCorpus(variant, 'corpus-genesis');
  }, variant);
  // No variant, seed, target, or route reaches the App profile or planner.
  await page.goto('/?corpusProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Attach readers to the actual App-owned session.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
    // @ts-expect-error Explicit ordinary quest acceptance, no discovery movement.
    const { acceptAppSurvey }: typeof import('./canonical-start-service.corpus-fixture') = await import('/tests/e2e/canonical-start-service.corpus-fixture.ts');
    return acceptAppSurvey();
  });
  const effects = () => page.evaluate(async target => {
    // @ts-expect-error Independent domain oracle, not planner input.
    const { chestEffects }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return chestEffects(target);
  }, setup.target);
  const actions = () => wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
  const replies = () => wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
  const baseline = await serviceProof(), decisions = [];
  expect(setup.first!.cells).toHaveLength(30);
  expect(setup.first!.cells.every(cell => ['entry', 'socket-0:passage'].includes(cell.at.cell.spaceId))).toBe(true);
  expect(setup.first!.cells.every(cell => cell.chests.length === 0)).toBe(true);
  expect(setup.before.questItems).toEqual([]); expect(setup.before.chest.chest.opened).toBe(false);
  expect(wire.sent).toEqual([]);
  try {
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(setup.target.contractId);
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Locate the survey seal in an ordinary chest, retrieve it, then return to the entrance.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    for (let window = 0; window < 17; window++) {
      const status = dialog.getByRole('status').filter({ hasText: /^(decision|satisfied|failed|blocked|completed|stopped)$/ });
      await expect(status).toBeVisible({ timeout: 60_000 });
      const phase = await status.innerText(), state = await effects(), counters = await serviceProof();
      decisions.push({ phase, state, counters, actions: structuredClone(actions()), replies: structuredClone(replies()) });
      expect(phase).toMatch(/^(decision|satisfied)$/);
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      if (!actions().some(action => action.capabilityId === 'maze.interact')) {
        expect(state.chest.chest.opened).toBe(false); expect(state.questItems).toEqual([]);
      }
      if (phase === 'satisfied') break;
      expect(window).toBeLessThan(16);
      const prior = wire.sent.filter(frame => frame.type === 'operation.wake').length;
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect.poll(() => wire.sent.filter(frame => frame.type === 'operation.wake').length).toBe(prior + 1);
      await expect.poll(() => actions().length).toBeGreaterThan(decisions.at(-1)!.actions.length);
    }
    expect(decisions.at(-1)!.phase).toBe('satisfied');
    const choices = actions(), results = replies();
    const frontiers = choices.filter(a => a.capabilityId === 'maze.explore').map(action => JSON.parse(action.arguments.frontier as string).selection);
    expect(frontiers.length).toBeGreaterThanOrEqual(2);
    expect(frontiers[0].direction).toBe('east');
    expect(frontiers[1].direction).toBe(variant === 'A' ? 'east' : 'north');
    for (const action of choices.filter(a => a.capabilityId === 'maze.explore')) {
      const index = choices.indexOf(action), previous = results.find(r => r.actionId === choices[index - 1].actionId)!;
      expect(previous.observation.data.scope).toBe('frontiers');
      expect(previous.observation.data.frontiers.some((f: { frontier: string }) => f.frontier === action.arguments.frontier)).toBe(true);
    }
    expect(choices.filter(a => a.capabilityId === 'maze.interact')).toHaveLength(1);
    const final = await effects(), completion = results.at(-1)!;
    expect(final.questItems).toHaveLength(1); expect(final.questItems[0].quantity).toBe(1);
    expect(final.quest.quest.status).toBe('complete');
    expect(final.checkpoint.position).toEqual(setup.position);
    expect(completion).toMatchObject({ disposition: 'applied', completion: { evidenceId: completion.evidenceId },
      observation: { data: { scope: 'objective', status: 'satisfied', carried: 1, atReturn: true } } });
    await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'outcome' && frame.runId === choices.at(-1)!.runId)).toBe(true);
    const counters = await serviceProof(), delta = counterDelta(counters, baseline);
    expect(counters.paidProviderCalls).toBe(0);
    expect(delta.created).toBe(decisions.length);
    expect(delta.initial.stepsPlanned + delta.successor.stepsPlanned).toBe(choices.length);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(decisions.length - 1);
    expect(JSON.stringify(results)).not.toContain(setup.target.contractId);
    await page.screenshot({ path: info.outputPath(`corpus-${variant}-satisfied.png`) });
    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const released = await effects();
    expect(released.head.allocations).toEqual({}); expect(released.questItems).toEqual(final.questItems);
    expect(await serviceProof()).toEqual(counters);
    await info.attach('corpus-service-proof.json', { body: JSON.stringify({ variant, setup, decisions, final, released, delta,
      sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses }, null, 2), contentType: 'application/json' });
  } finally {
    await info.attach('corpus-final-state.json', { body: JSON.stringify({ variant, setup, decisions,
      final: await effects().catch(String), sent: wire.sent, received: wire.received, counters: await serviceProof(),
      alerts: await page.getByRole('alert').allTextContents() }, null, 2), contentType: 'application/json' });
  }
});

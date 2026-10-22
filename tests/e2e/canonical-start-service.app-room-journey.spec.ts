import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { KnownNode } from '../../src/persistence/canonical/knowledge/graph';
import type { GameSession } from '../../src/services/game/GameSession';
import { matchesQuestItem } from '../../src/domain/quests/questItems';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { attachCorpusApp, corpusActions, corpusEffects } from './canonical-start-service.corpus-recovery.steps';
import { adoptJourney } from './canonical-start-service.room-journey';

test.use({ freshCorpus: true });
const allowances = { maxSteps: 64, maxRefinements: 48, maxPlanContinuations: 16, timeoutSeconds: 300, actionTimeoutSeconds: 30 };

for (const variant of ['A', 'B'] as const) test(`${variant}: actual App room journey scouts, selects page two, retrieves and returns${variant === 'B' ? ' across reload adoption' : ''}`, async ({ page, wire }, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const genesis = await page.evaluate(async variant => {
    // @ts-expect-error Authored world genesis only; no knowledge, sight, placement or planner inputs.
    const { initializeCorpus }: typeof import('./canonical-corpus.initialize') = await import('/tests/e2e/canonical-corpus.initialize.ts');
    return initializeCorpus(variant, 'room-journey-genesis');
  }, variant);
  expect(genesis.initialized.head.checkpoint.knowledge).toBeNull();
  await page.goto('/?corpusProof=1&roomJourneyProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible(); await attachCorpusApp(page);
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Accept public guild offer without exploration; hidden target is audit-only.
    const { acceptAppSurvey }: typeof import('./canonical-start-service.corpus-fixture') = await import('/tests/e2e/canonical-start-service.corpus-fixture.ts');
    return acceptAppSurvey();
  });
  const effects = () => corpusEffects(page, setup.target), actions = () => corpusActions(wire);
  const replies = () => wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
  const custody = (action: AgenticaAction) => page.evaluate(async action => {
    // @ts-expect-error Independent exact original evidence, never planner input.
    const { corpusCustody }: typeof import('./canonical-start-service.room-journey-evidence') = await import('/tests/e2e/canonical-start-service.room-journey-evidence.ts');
    return corpusCustody(action);
  }, action);
  const replay = (originals: AgenticaAction[]) => page.evaluate(async originals => {
    // @ts-expect-error Completed original hooks with fresh submission forbidden.
    const { journeyReplay }: typeof import('./canonical-start-service.room-journey-evidence') = await import('/tests/e2e/canonical-start-service.room-journey-evidence.ts');
    return journeyReplay(originals);
  }, originals);
  const baseline = await serviceProof(), decisions: unknown[] = [];
  let selection: { node: KnownNode; action: AgenticaAction; custody: Awaited<ReturnType<typeof custody>> } | undefined;
  let entrance: { snapshot: Awaited<ReturnType<typeof window.canonicalStartService.snapshot>>;
    frame: { row: number; column: number; rows: number; columns: number; key: string } } | undefined;
  let adoption: Awaited<ReturnType<typeof adoptJourney>> | undefined;
  try {
    expect(setup.first!.cells).toHaveLength(30); expect(setup.before.questItems).toEqual([]); expect(wire.sent).toEqual([]);
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(setup.target.contractId);
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill(
      'Scout at least three earned rooms without collecting. Return to the entrance, choose the disclosed chest room from a later map page, travel there, collect once, then return with the survey seal.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    for (let cycle = 0; cycle < 17; cycle++) {
      const status = dialog.getByRole('status').filter({ hasText: /^(decision|satisfied|failed|blocked|completed|stopped|recovery)$/ });
      await expect(status).toBeVisible({ timeout: 60_000 });
      const phase = await status.innerText(), state = await effects(), snapshot = await page.evaluate(() => window.canonicalStartService.snapshot());
      decisions.push({ phase, state, snapshot, counters: await serviceProof(), actions: structuredClone(actions()) });
      expect(phase).toMatch(/^(decision|satisfied)$/); await expect(dialog.getByRole('alert')).toHaveCount(0);
      expect(snapshot.launch!.binding.start.limits).toMatchObject(allowances);
      if (phase === 'satisfied') break;
      const choices = actions(), count = choices.length, last = choices.at(-1)!;
      if (!choices.some(action => action.capabilityId === 'maze.interact')) {
        expect(state.chest.chest.opened).toBe(false); expect(state.questItems).toEqual([]);
      }
      const connectionIndex = choices.findIndex(action => action.capabilityId === 'maze.inspect' && action.arguments.scope === 'connections');
      if (!selection && connectionIndex >= 0) {
        expect(last.capabilityId).toBe('maze.navigate');
        const secondQuery = choices[connectionIndex - 1];
        expect(secondQuery.arguments).toMatchObject({ scope: 'map', cursor: expect.any(String) });
        const firstQuery = choices[connectionIndex - 2], first = replies().find(r => r.actionId === firstQuery.actionId)!;
        const second = replies().find(r => r.actionId === secondQuery.actionId)!;
        expect(firstQuery.arguments).toEqual({ scope: 'map' }); expect(secondQuery.arguments.cursor).toBe(first.observation.data.next);
        expect(second.observation.revision).toBe(first.observation.revision);
        const firstRooms = first.observation.data.rooms as KnownNode[], secondRooms = second.observation.data.rooms as KnownNode[];
        expect(firstRooms).toHaveLength(2); expect(firstRooms.length + secondRooms.length).toBeGreaterThanOrEqual(3);
        const node = secondRooms.find(room => room.spaceId === choices[connectionIndex].arguments.spaceId)!;
        expect(node).toBeDefined(); expect(firstRooms.some(room => room.spaceId === node.spaceId)).toBe(false);
        expect(last.arguments).toEqual({ level: node.anchor.at.level, ...node.anchor.at.cell });
        expect(entrance).toBeDefined();
        const { row, column } = node.anchor.world, frame = entrance!.frame;
        expect(row < frame.row || row >= frame.row + frame.rows || column < frame.column || column >= frame.column + frame.columns).toBe(true);
        const retained = await custody(last);
        if (retained.operation.kind !== 'navigation') throw Error('Selected anchor must admit navigation.');
        expect(retained.original.publication.snapshot.checkpoint).toEqual(entrance!.snapshot.head.checkpoint);
        expect(retained.original.publication.snapshot.roots.knowledge).toBe(entrance!.snapshot.head.roots.knowledge);
        expect(retained.operation.progress).toMatchObject({ status: 'arrived', position: node.anchor.at,
          binding: { kind: 'known-destination', target: node.anchor.at, limits: { steps: 64, replans: 4, durationMs: 120_000 } } });
        expect(retained.operation.progress.steps).toBeGreaterThan(16);
        expect(retained.operation.progress.replans).toBeGreaterThanOrEqual(1);
        expect(retained.operation.progress.steps).toBeLessThanOrEqual(64);
        expect(retained.operation.progress.replans).toBeLessThanOrEqual(4);
        expect(state.checkpoint.position).toEqual(node.anchor.at);
        selection = { node, action: last, custody: retained };
        await info.attach('selected-anchor-arrival.json', { body: JSON.stringify({ selection, entrance }, null, 2), contentType: 'application/json' });
        if (variant === 'B') {
          adoption = await adoptJourney(page, wire);
          const recovered = await custody(last);
          expect(recovered.original).toEqual(retained.original); expect(recovered.binding).toEqual(retained.binding);
          expect(recovered.operation.progress).toEqual(retained.operation.progress); expect(recovered.terminal.event).toEqual(retained.terminal.event);
          await expect.poll(() => actions().length).toBeGreaterThan(count);
          continue;
        }
      }
      const atEntrance = state.checkpoint.position.level === setup.position.level
        && (['spaceId', 'row', 'column'] as const).every(key => state.checkpoint.position.cell[key] === setup.position.cell[key]);
      if (!selection && last.capabilityId === 'maze.navigate' && atEntrance) {
        await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
        const key = `${snapshot.head.generation}:${snapshot.head.gameId}:${snapshot.head.revision}:${snapshot.head.roots.knowledge}:`;
        await expect.poll(async () => (await page.locator('canvas').getAttribute('data-frame'))?.startsWith(key)).toBe(true);
        const frame = await page.locator('canvas').evaluate(c => ({ row: Number(c.dataset.rowStart), column: Number(c.dataset.columnStart),
          rows: Number(c.dataset.rows), columns: Number(c.dataset.columns), key: c.dataset.frame! }));
        expect(frame.key).toContain(key);
        entrance = { snapshot, frame };
      }
      expect(cycle).toBeLessThan(16);
      await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect.poll(() => actions().length).toBeGreaterThan(count);
    }
    await expect(dialog.getByRole('status').filter({ hasText: /^satisfied$/ })).toBeVisible();
    expect(selection).toBeDefined(); expect(!!adoption).toBe(variant === 'B');
    const final = await effects(), all = actions(), results = replies();
    expect(all.filter(a => a.capabilityId === 'maze.interact')).toHaveLength(1);
    expect(final.questItems).toHaveLength(1); expect(final.questItems[0].quantity).toBe(1);
    expect(final.inventory.items.filter(item => matchesQuestItem(item, final.quest.quest))).toEqual(final.questItems);
    expect(final.stash.items.filter(item => matchesQuestItem(item, final.quest.quest))).toEqual([]);
    expect(final.quest.quest.status).toBe('complete'); expect(final.chest.chest.opened).toBe(true);
    expect(final.checkpoint.position).toEqual(setup.position);
    expect(results.at(-1)).toMatchObject({ disposition: 'applied', completion: { evidenceId: expect.any(String) },
      observation: { data: { scope: 'objective', status: 'satisfied', carried: 1, atReturn: true } } });
    await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'outcome' && frame.runId === all.at(-1)!.runId)).toBe(true);
    const outcome = wire.received.find(({ frame }) => frame.type === 'outcome' && frame.runId === all.at(-1)!.runId)!;
    expect(outcome.frame.payload).toMatchObject({ outcome: { status: 'succeeded', stopReason: 'complete' } });
    expect(all.length).toBeLessThanOrEqual(64);
    for (const result of results) {
      expect(result.disposition).toBe('applied'); expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(4096);
      expect(Buffer.byteLength(JSON.stringify(result.observation))).toBeLessThanOrEqual(2800);
    }
    const selectedAt = all.findIndex(a => a.actionId === selection!.action.actionId);
    expect(all.findIndex(a => a.capabilityId === 'maze.interact')).toBeGreaterThan(selectedAt);
    for (const action of all.filter(a => a.capabilityId === 'maze.explore')) {
      const query = results.find(r => r.actionId === all[all.indexOf(action) - 1].actionId)!;
      expect(query.observation.data.scope).toBe('frontiers');
      expect(query.observation.data.frontiers.some((f: { frontier: string }) => f.frontier === action.arguments.frontier)).toBe(true);
    }
    const beforeReplay = await page.evaluate(() => window.canonicalStartService.snapshot()), exact = await replay(all);
    for (const row of exact) {
      expect(row.retry.submissions).toBe(0); const retried = row.retry.results[0];
      expect(retried.actionResult).toEqual(row.original.result); expect(retried.reconciled).toEqual(row.original.result);
      expect(retried.after).toEqual(retried.original);
    }
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(beforeReplay);
    const counters = await serviceProof(); expect(counters.paidProviderCalls).toBe(0);
    expect(wire.sent.filter(f => f.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(f => f.type === 'operation.adopt')).toHaveLength(variant === 'B' ? 1 : 0);
    expect(wire.sent.filter(f => f.type === 'resume')).toEqual([]);
    await page.screenshot({ path: info.outputPath('room-journey-completed.png') });
    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const released = await effects(); expect(released.head.allocations).toEqual({}); expect(released.questItems).toEqual(final.questItems);
    expect(await serviceProof()).toEqual(counters);
    await info.attach('room-journey-proof.json', { body: JSON.stringify({ genesis, setup, baseline, decisions, selection, entrance, adoption,
      final, released, exact, counters, sent: wire.sent, received: wire.received, http: wire.http }, null, 2), contentType: 'application/json' });
  } finally {
    const host = await page.evaluate(() => {
      const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession;
      return { status: session.view.status, recoveryRequired: session.view.recoveryRequired, diagnostics: session.view.diagnostics };
    }).catch(String);
    await info.attach('room-journey-final-state.json', { body: JSON.stringify({ variant, decisions, selection, entrance, adoption,
      host, state: await effects().catch(String), counters: await serviceProof(), sent: wire.sent, received: wire.received,
      http: wire.http, responses: wire.responses, errors: wire.errors, alerts: await page.getByRole('alert').allTextContents() }, null, 2), contentType: 'application/json' });
  }
});

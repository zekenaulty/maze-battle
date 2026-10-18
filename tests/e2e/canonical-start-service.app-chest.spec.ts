import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { ChestTarget } from './canonical-start-service.chest-fixture';
import { ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';
import { chestArgs } from '../../src/services/agentica/game/chestSelection';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';

async function effects(page: Page, target: ChestTarget) {
  return page.evaluate(async selected => {
    // @ts-expect-error Native Vite helper; read-only oracle is never planner input.
    const { chestEffects }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return chestEffects(selected);
  }, target);
}
async function operation(page: Page, action: AgenticaAction, successor?: AgenticaAction) {
  return page.evaluate(async ({ original, successor }) => {
    // @ts-expect-error Exact original protocol records, not a new SDK or GameSession.
    const { chestOperationEvidence }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return chestOperationEvidence(original, successor);
  }, { original: action, successor });
}
const domain = ({ head: _head, ...state }: Awaited<ReturnType<typeof effects>>) => state;

test('actual App inspects then explicitly opens a chest and Continues a zero-step custody-only successor', async ({ page, wire }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?chestProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Attach observation to the actual hook-owned session, never replace it.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
    // @ts-expect-error Ordinary manual setup from the guild board and earned sight.
    const { prepareAppChest }: typeof import('./canonical-start-service.chest-fixture') = await import('/tests/e2e/canonical-start-service.chest-fixture.ts');
    return prepareAppChest();
  });
  await info.attach('manual-chest-setup.json', { body: JSON.stringify(setup, null, 2), contentType: 'application/json' });
  expect(setup.moves).toBeGreaterThan(0); expect(setup.moves).toBeLessThanOrEqual(256);
  expect(setup.before.head.gameId).toBe(setup.initial.gameId);
  expect(setup.before.head.generation).toBe(setup.initial.generation);
  expect(setup.before.checkpoint.position).toEqual(setup.target.at);
  expect(setup.before.chest.chest.opened).toBe(false);
  expect(setup.before.quest).toMatchObject({ award: null, quest: { status: 'active', task: { objective: 'fetch', progress: 0 } } });
  expect(setup.before.questItems).toEqual([]); expect(wire.sent).toEqual([]);
  expect(setup.receipts.filter(command => command.kind !== 'exploration').map(command => command.input))
    .toEqual([{ kind: 'accept-quest', contractId: setup.target.contractId }, { kind: 'leave-town' }]);

  const baseline = await serviceProof();
  let release!: () => void, pausedProbe: HostOperationEvent | undefined;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  await page.route('http://127.0.0.1:5259/api/operations/events', async route => {
    const event = route.request().postDataJSON() as HostOperationEvent;
    if (!pausedProbe && event.operationId.startsWith('interact-') && event.sequence === 1) {
      pausedProbe = event; await barrier;
    }
    // No response replacement: the real pinned service receives and acknowledges the original bytes.
    await route.fallback();
  });
  try {
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await expect(dialog).toContainText('decision-chest');
    expect(domain(await effects(page, setup.target))).toEqual(domain(setup.before));
    expect(await serviceProof()).toEqual(baseline); expect(wire.sent).toEqual([]);
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Inspect my tile and open its chest once. After explicit Continue, observe and navigate to that same tile as a zero-step custody test, not quest-return proof.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    await expect.poll(() => pausedProbe !== undefined).toBe(true);
    const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
    expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.interact']);
    const launch = (await page.evaluate(() => window.canonicalStartService.snapshot())).launch!;
    const actor = launch.binding.start.observation.data.actor as Record<string, unknown>;
    expect(launch.binding.start.capabilities).toHaveLength(5);
    expect(actions[0].arguments).toEqual({ scope: 'cell', level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
    const replies = wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
    expect(replies).toHaveLength(2); expect(replies.map(reply => reply.disposition)).toEqual(['applied', 'applied']);
    const query = replies.find(reply => reply.actionId === actions[0].actionId)!;
    const cell = query.observation.data.cell;
    expect(query.observation.data.scope).toBe('cell'); expect(cell.state).toBe('visible');
    expect(cell.at).toEqual({ level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
    expect(cell.chests).toHaveLength(1); expect(cell.chests[0].opened).toBe(false);
    expect(actions[1].arguments).toEqual({ target: cell.chests[0].target });
    const selected = chestArgs(actions[1].arguments, launch.binding.publication);
    expect(selected.source).toMatchObject({ sequence: setup.before.checkpoint.knowledge!.sequence, id: setup.before.checkpoint.knowledge!.id });
    const admission = replies.find(reply => reply.actionId === actions[1].actionId)!;
    expect(admission.operation.operationId).toMatch(/^interact-[a-f0-9]{64}$/);
    const held = await effects(page, setup.target), pending = await operation(page, actions[1]);
    expect(domain(held), 'Admission and service confirmation must not open or loot the chest').toEqual(domain(setup.before));
    for (const area of ['world', 'knowledge'] as const) expect(held.head.roots[area]).toEqual(setup.before.head.roots[area]);
    expect(pending.parent).toMatchObject({ kind: 'interaction', custodyAck: null, event: null,
      progress: { sequence: 0, status: 'pending', result: null }, operation: { state: 'admitted' } });
    expect(pending.parentTerminal).toBeNull(); expect(pausedProbe).toEqual(pending.parent.confirmation.data.probe);
    expect(wire.http.filter(row => row.method === 'POST' && new URL(row.url).pathname === '/api/operations/events')).toEqual([]);
    await info.attach('effect-free-chest-admission.json', { body: JSON.stringify({ actions, replies, selected, held, pending, pausedProbe }, null, 2), contentType: 'application/json' });

    release();
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    const after = await effects(page, setup.target), retained = await operation(page, actions[1]);
    expect(after.chest.chest.opened).toBe(true); expect(after.checkpoint.position).toEqual(setup.target.at);
    expect(after.quest.quest.status).toBe('complete'); expect(after.quest.quest.task.progress).toBe(1);
    expect(after.questItems).toHaveLength(1);
    expect(after.questItems[0]).toMatchObject({ category: 'quest', quantity: 1, questId: setup.target.contractId });
    expect(after.quest.award).toEqual({ chestId: setup.target.chestId, itemId: after.questItems[0].id });
    expect(after.chest.chest.loot).toContainEqual(after.questItems[0]);
    expect(after.inventory.items).toContainEqual(after.questItems[0]); expect(after.stash).toEqual(setup.before.stash);
    expect(after.checkpoint.knowledge!.sequence).toBe(setup.before.checkpoint.knowledge!.sequence + 1);
    expect(retained.parent).toMatchObject({ kind: 'interaction', progress: { sequence: 1, status: 'applied',
      result: { kind: 'open-chest', outcome: 'applied' } }, operation: { state: 'settled', terminal: { disposition: 'decision' } } });
    expect(retained.parent.custodyAck).not.toBeNull();
    expect(retained.parentTerminal).not.toBeNull(); expect(retained.parent.event).not.toBeNull();
    const terminal = retained.parentTerminal!.event, progress = retained.parent.event!.data.event;
    const lootIds = retained.parent.progress.result?.lootIds;
    if (!Array.isArray(lootIds) || !lootIds.every((id): id is string => typeof id === 'string')) throw Error('Expected exact retained raw loot IDs.');
    expect(terminal).toMatchObject({ kind: 'decision', operationId: admission.operation.operationId, usage: {} });
    expect(terminal.observation).toEqual(progress.observation);
    expect(progress.observation.data.interaction).toEqual({ kind: 'open-chest', outcome: 'applied', itemsReceived: lootIds.length });
    expect(progress.usage).toEqual({});
    for (const privateId of [setup.target.contractId, ...lootIds])
      expect(JSON.stringify([progress, terminal])).not.toContain(privateId);
    const completed = await serviceProof();
    expect(counterDelta(completed, baseline)).toEqual({ created: 1,
      initial: { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 }, successor: absentWindow });
    expect(completed.paidProviderCalls).toBe(0);
    await page.screenshot({ path: info.outputPath('actual-app-chest-decision.png') });
    await info.attach('chest-before-continue.json', { body: JSON.stringify({ after, retained, completed }, null, 2), contentType: 'application/json' });

    const quiet = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    expect(await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence())).toEqual(quiet);
    expect(await serviceProof()).toEqual(completed);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => wire.sent.filter(frame => frame.type === 'operation.wake').length).toBe(1);
    await expect.poll(() => wire.sent.filter(frame => frame.type === 'action.result').length).toBe(4);
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    const successorActions = wire.received.filter(({ frame }) => frame.type === 'action.request').slice(2).map(({ frame }) => frame.payload as AgenticaAction);
    expect(successorActions.map(action => action.capabilityId)).toEqual(['maze.observe', 'maze.navigate']);
    expect(successorActions[0].arguments).toEqual({});
    const observed = wire.sent.find(frame => frame.type === 'action.result' && frame.payload.actionId === successorActions[0].actionId)!.payload.observation;
    const target = observed.data.actor;
    expect(successorActions[1].arguments).toEqual({ level: target.level, spaceId: target.spaceId, row: target.row, column: target.column });
    expect(successorActions[1].runId).not.toBe(actions[1].runId);
    for (const field of ['sessionId', 'sessionEpoch', 'manifestHash'] as const) expect(successorActions[1][field]).toBe(actions[1][field]);
    const continued = await operation(page, actions[1], successorActions[1]), continuationEffects = await effects(page, setup.target);
    if (continued.child?.kind !== 'navigation' || !continued.childTerminal || !continued.claim || !continued.successorGrant)
      throw Error('Missing exact continuation custody evidence.');
    expect(continued.parent.operation.state).toBe('acknowledged');
    expect(continued.parent.progress).toEqual(retained.parent.progress);
    expect(continued.predecessorAck?.source.input).toMatchObject({ operationId: retained.parent.operation.id,
      proof: { delivery: 'decision-handoff', event: terminal } });
    expect(continued.claim.data.started.runId).toBe(successorActions[1].runId);
    expect(continued.successorGrant.record.value.kind).toBe('agentica-successor-grant');
    expect(continued.successorGrant.started.runId).toBe(successorActions[1].runId);
    expect(continued.successorGrant.record.ref).toEqual(continued.selection!.value.data.grant);
    expect(continued.child.confirmation.data.binding).toEqual({ grant: continued.successorGrant.record.ref,
      publication: continued.claim.decision.data.publication });
    for (const field of ['provider', 'limits', 'capabilities'] as const)
      expect(continued.successorGrant.start[field]).toEqual(launch.acceptedStart[field]);
    expect(continued.claim.decision.publication.snapshot.checkpoint).toEqual(after.checkpoint);
    expect(continued.child.progress).toMatchObject({ sequence: 0, steps: 0, status: 'arrived', position: setup.target.at,
      binding: { kind: 'known-destination', target: setup.target.at } });
    expect(continued.child.event).toBeNull(); expect(continued.childTerminal.event.kind).toBe('decision');
    expect(continued.childTerminal.event.usage).toEqual({ steps: 0, replans: 0 });
    expect(domain(continuationEffects)).toEqual(domain(after));
    for (const area of ['world', 'knowledge'] as const) expect(continuationEffects.head.roots[area]).toEqual(after.head.roots[area]);
    for (const field of ['gameId', 'generation', 'owner', 'epoch'] as const) expect(continuationEffects.head[field]).toBe(after.head[field]);
    expect(Object.keys(continuationEffects.head.allocations).sort()).toEqual([launch.guard.id, continued.child.operation.id].sort());
    expect(wire.sent.find(frame => frame.type === 'operation.wake')!.payload).toEqual(continued.claim.decision.data.event);
    const continuedCounters = await serviceProof(), windowCounts = { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 };
    expect(counterDelta(continuedCounters, baseline)).toEqual({ created: 2, initial: windowCounts, successor: windowCounts });
    expect(continuedCounters.paidProviderCalls).toBe(0);
    await page.screenshot({ path: info.outputPath('actual-app-chest-explicit-continue.png') });

    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    expect(domain(await effects(page, setup.target))).toEqual(domain(after));
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await expect(recovery.getByText(successorActions[1].actionId, { exact: true })).toBeVisible();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: /terminal prefix delivered/ })).toBeVisible();
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: /acknowledged \(decision\)/ })).toBeVisible();
    const childAck = await effects(page, setup.target);
    expect(Object.keys(childAck.head.allocations)).toEqual([launch.guard.id]);
    expect(childAck.head.quota).toMatchObject({ reservations: 1, reservedBytes: ACKNOWLEDGEMENT_BYTES });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const final = await effects(page, setup.target), finalProtocol = await operation(page, actions[1], successorActions[1]);
    expect(domain(final)).toEqual(domain(after)); expect(final.head.allocations).toEqual({});
    expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
    expect(finalProtocol.parent.operation.state).toBe('acknowledged');
    expect(finalProtocol.parent.progress).toEqual(retained.parent.progress);
    expect(finalProtocol.parentTerminal?.event).toEqual(terminal);
    expect(finalProtocol.child?.operation.state).toBe('acknowledged');
    expect(finalProtocol.child?.progress).toEqual(continued.child.progress);
    expect(finalProtocol.childTerminal?.event).toEqual(continued.childTerminal.event);
    expect((await page.evaluate(() => window.canonicalStartService.snapshot())).launch!.guard.state).toBe('acknowledged');
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.received.filter(({ frame }) => frame.type === 'action.request')).toHaveLength(4);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
    expect(wire.sent.filter(frame => ['operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
    const delivered = wire.http.filter(row => row.method === 'POST'
      && ['/api/operations/events', '/api/operations/stop-decision'].includes(new URL(row.url).pathname)).map(row => row.body);
    expect(delivered).toEqual([pausedProbe, progress, continued.child.confirmation.data.probe, continued.childTerminal.event]);
    expect(await serviceProof()).toEqual(continuedCounters);
    await info.attach('actual-app-chest-proof.json', { body: JSON.stringify({ setup, held, pending, after, retained, childAck, final,
      finalProtocol, baseline, completed, continuedCounters, continued, continuationEffects, successorActions, selected, actions, replies, delivered, sent: wire.sent, received: wire.received,
      http: wire.http, responses: wire.responses }, null, 2), contentType: 'application/json' });
  } finally {
    release();
    await info.attach('chest-final-state.json', { body: JSON.stringify({ effects: await effects(page, setup.target).catch(String),
      snapshot: await page.evaluate(() => window.canonicalStartService.snapshot()).catch(String),
      counters: await serviceProof(), sent: wire.sent, received: wire.received, http: wire.http,
      alerts: await page.getByRole('alert').allTextContents() }, null, 2), contentType: 'application/json' });
  }
});

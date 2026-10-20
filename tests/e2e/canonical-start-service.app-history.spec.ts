import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { ACKNOWLEDGEMENT_BYTES, DEFAULT_WORK_LIMITS } from '../../src/persistence/canonical/types';
import { MAX_DECISION_READS, MAX_DECISION_LOOKUPS, MAX_DECISION_READ_BYTES } from '../../src/persistence/canonical/agentica/decision.query.read';
import { MAX_EVENT_BYTES } from '../../src/persistence/canonical/agentica/operation.types';
import type { GameSession } from '../../src/services/game/GameSession';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { serviceOrigin } from '../agentica-start-service/service.mjs';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';
import { adoptHistory } from './canonical-start-service.history-adoption';

test.use({ roomProof: true });
const initialWindow = { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 };
async function plannerHistory() {
  // Fixture output read by the test runner only; never an App or planner input.
  const response = await fetch(serviceOrigin + '/fixture/history');
  expect(response.ok).toBe(true);
  const output: { events: unknown[] } = await response.json();
  expect(Object.keys(output)).toEqual(['events']);
  expect(Array.isArray(output.events)).toBe(true); expect(output.events.length).toBeLessThanOrEqual(2);
  for (const event of output.events) expect(Buffer.byteLength(JSON.stringify(event), 'utf8')).toBeLessThanOrEqual(MAX_EVENT_BYTES);
  return output;
}
async function operation(page: Page, original: AgenticaAction, successor?: AgenticaAction) {
  return page.evaluate(async ({ original, successor }) => {
    // @ts-expect-error Read-only native evidence, never a replacement session or planner input.
    const { appNavigationEvidence }: typeof import('./canonical-start-service.app-evidence') = await import('/tests/e2e/canonical-start-service.app-evidence.ts');
    return appNavigationEvidence(original, successor);
  }, { original, successor });
}
async function queries(page: Page, actions: AgenticaAction[]) {
  return page.evaluate(async actions => {
    // @ts-expect-error Immutable execution-only replay, never delivered to the planner.
    const { historyEvidence }: typeof import('./canonical-start-service.history-evidence') = await import('/tests/e2e/canonical-start-service.history-evidence.ts');
    return historyEvidence(actions);
  }, actions);
}

for (const adoption of [false, true]) test(adoption
  ? 'actual App explicitly queries historical decision after reload adoption then settles zero-step custody'
  : 'actual App explicitly queries historical decision after room Continue then settles zero-step custody', async ({ page, wire }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?roomProof=1&historyProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Attach the test reader to the actual hook-owned session only.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
  });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot()), baseline = await serviceProof();
  expect(before.launch).toBeNull(); expect(wire.sent).toEqual([]);
  try {
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await expect(dialog).toContainText('decision-history');
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill(
      'Explore one earned room until a material decision. After explicit Continue, inspect the historical decision twice, then navigate to the observed current tile for zero-step custody only.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    const initial = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
    expect(initial.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.explore']);
    expect(initial[0].arguments).toEqual({ scope: 'frontiers' });
    expect(initial[1].arguments).toMatchObject({ mode: 'room', frontier: expect.any(String) });
    const after = await page.evaluate(() => window.canonicalStartService.snapshot()), retained = await operation(page, initial[1]);
    if (retained.parent?.kind !== 'navigation' || !retained.parentTerminal) throw Error('Missing original navigation terminal.');
    const terminal = retained.parentTerminal.event;
    expect(retained.parent.progress).toMatchObject({ status: 'decision', reason: 'scope-boundary', steps: 4,
      notice: { kind: 'other-space-visible', source: { sequence: expect.any(Number), id: expect.any(String), index: expect.any(Number) } } });
    expect(terminal.observation).toEqual(retained.parent.event!.data.event.observation);
    expect(terminal.observation!.data.navigation).toMatchObject({ notice: retained.parent.progress.notice });
    expect(await plannerHistory()).toEqual({ events: [] });
    expect(after.head.roots.world).toEqual(before.head.roots.world);
    const paused = await serviceProof();
    expect(counterDelta(paused, baseline)).toEqual({ created: 1, initial: initialWindow, successor: absentWindow });
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    expect(await serviceProof()).toEqual(paused);
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(after);

    const reloaded = adoption ? await adoptHistory(page, wire, after) : null;
    if (!adoption) await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => wire.sent.filter(frame => frame.type === 'action.result').length).toBe(5);
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
    expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.explore', 'maze.inspect', 'maze.inspect', 'maze.navigate']);
    expect(actions.slice(2, 4).map(action => action.arguments)).toEqual([{ scope: 'decision' }, { scope: 'decision' }]);
    const replies = wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
    expect(replies.map(reply => reply.disposition)).toEqual(Array(5).fill('applied'));
    expect(replies.every(reply => reply.completion === undefined)).toBe(true);
    const continued = await operation(page, initial[1], actions[4]), continuedHead = await page.evaluate(() => window.canonicalStartService.snapshot());
    if (!continued.claim || !continued.selection || !continued.parent || continued.child?.kind !== 'navigation' || !continued.childTerminal)
      throw Error('Missing continued custody evidence.');
    const continuation = wire.sent.find(frame => frame.type === (adoption ? 'operation.adopt' : 'operation.wake'))!.payload;
    const wake = adoption ? continuation.decision : continuation;
    expect(wake).toEqual(continued.claim.decision.data.event);
    const epoch = reloaded?.head.epoch ?? after.head.epoch;
    expect(actions.slice(2).map(action => action.sessionEpoch)).toEqual(Array(3).fill(String(epoch)));
    expect(terminal.sessionEpoch).toBe(String(after.head.epoch));
    expect(continued.selection.value.data.grant).toEqual(continued.child.confirmation.data.binding.grant);
    expect(continued.child.operation).toMatchObject({ owner: reloaded?.head.owner ?? after.head.owner, epoch });
    expect(continuedHead.launch!.binding).toEqual(after.launch!.binding);
    expect(continuedHead.launch!.grant).toEqual(after.launch!.grant);
    if (reloaded) {
      expect(wake).toStrictEqual(terminal);
      expect(continued.claim.decision.data.adoption).toMatchObject({ nextSessionEpoch: String(epoch) });
      expect(continuation).toEqual({ decision: wake, adoption: continued.claim.decision.data.adoption });
      expect(continued.guardAdoption!.source).toMatchObject({ operation: 'operation.adopt',
        attemptId: `${continued.claim.decision.reference.id}:guard`, expected: { owner: reloaded.head.owner, epoch } });
      expect(continued.guardAdoption!.receipt.beforeRevision).toBeGreaterThanOrEqual(continued.claim.row.revision);
      expect(continuedHead.launch!.guard).toMatchObject({ owner: reloaded.head.owner, epoch, state: 'admitted' });
    }
    const currentObservation = adoption ? continuation.adoption.observation : wake.observation;
    expect(currentObservation.data.scope).toBe('actor'); expect(currentObservation.data.navigation).toBeUndefined();
    expect(currentObservation).not.toEqual(terminal.observation);
    const actor = currentObservation.data.actor;
    expect(actions[4].arguments).toEqual({ level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
    const history = replies.slice(2, 4);
    for (const reply of history) {
      expect(reply.operation).toBeUndefined();
      expect(reply.observation.data).toEqual({ scope: 'decision', state: 'historical', event: terminal });
      expect(JSON.stringify(reply.observation.data.event)).toBe(JSON.stringify(terminal));
    }
    expect(history[0].observation.observationId).not.toBe(history[1].observation.observationId);
    const plannerReceived = await plannerHistory();
    // Agentica's planning-frame snapshot sorts object keys, but must preserve every value.
    expect(plannerReceived).toStrictEqual({ events: [terminal, terminal] });
    expect(continued.parent.operation.state).toBe('acknowledged');
    expect(continued.parent.progress).toEqual(retained.parent.progress);
    expect(continued.child.progress).toMatchObject({ sequence: 0, steps: 0, status: 'arrived', position: retained.parent.progress.position });
    expect(continued.child.event).toBeNull();
    expect(continued.childTerminal.event.usage).toEqual({ steps: 0, replans: 0 });
    expect(continuedHead.head.checkpoint).toEqual(after.head.checkpoint);
    for (const area of ['world', 'knowledge'] as const) expect(continuedHead.head.roots[area]).toEqual(after.head.roots[area]);
    const replay = await queries(page, actions.slice(2, 4));
    for (let i = 0; i < replay.length; i++) {
      expect(replay[i].result).toEqual(history[i]);
      expect(replay[i].source.decision).toMatchObject({ schema: 1, grant: continued.selection.value.data.grant,
        previous: { intent: continued.claim.decision.reference,
          observation: { kind: 'progress', reference: retained.parent.event!.reference } } });
    }
    const metrics = await page.evaluate(async () => {
      // @ts-expect-error Test-only observation of real counters and committed transaction diagnostics.
      const { historyReadMetrics }: typeof import('./canonical-start-service.history-evidence') = await import('/tests/e2e/canonical-start-service.history-evidence.ts');
      return historyReadMetrics();
    });
    // Each fresh query has a shared authorization meter and a nested preparer meter.
    expect(metrics.fresh).toHaveLength(4);
    for (const meter of metrics.fresh) {
      expect(meter.reads).toBeGreaterThan(0); expect(meter.reads).toBeLessThanOrEqual(MAX_DECISION_READS);
      expect(meter.lookups).toBeLessThanOrEqual(MAX_DECISION_LOOKUPS);
      expect(meter.bytes).toBeLessThanOrEqual(MAX_DECISION_READ_BYTES);
    }
    const freshCommits = replay.map(row => metrics.commits.find(commit => commit.revision === row.source.sourceRequest.expected.revision + 1));
    for (const commit of freshCommits) {
      expect(commit).toBeDefined(); expect(commit!.replayed).toBe(false);
      expect(commit!.stats.reads).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.reads);
      expect(commit!.stats.readBytes + commit!.stats.writeBytes).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.bytes);
    }
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(continuedHead);
    const counters = await serviceProof();
    expect(counterDelta(counters, baseline)).toEqual({ created: 2, initial: initialWindow,
      successor: { instances: 1, createCalls: 1, refineCalls: 2, stepsPlanned: 3, emptyPlans: 0 } });
    expect(counters.paidProviderCalls).toBe(0);

    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await expect(recovery.getByText(actions[4].actionId, { exact: true })).toBeVisible();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: /terminal prefix delivered/ })).toBeVisible();
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: /acknowledged \(decision\)/ })).toBeVisible();
    const childAck = await page.evaluate(() => window.canonicalStartService.snapshot());
    expect(Object.keys(childAck.head.allocations)).toEqual([childAck.launch!.guard.id]);
    expect(childAck.head.quota).toMatchObject({ reservations: 1, reservedBytes: ACKNOWLEDGEMENT_BYTES });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    await expect(recovery.getByText('Session clearance', { exact: true }).locator('..')).toContainText('Unknown');
    const final = await page.evaluate(() => window.canonicalStartService.snapshot()), finalProtocol = await operation(page, initial[1], actions[4]);
    expect(final.launch!.guard.state).toBe('acknowledged'); expect(final.head.allocations).toEqual({});
    expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
    expect(final.head.checkpoint).toEqual(after.head.checkpoint);
    for (const area of ['world', 'knowledge'] as const) expect(final.head.roots[area]).toEqual(after.head.roots[area]);
    expect(finalProtocol.parent!.operation.state).toBe('acknowledged');
    expect(finalProtocol.child!.operation.state).toBe('acknowledged');
    expect(finalProtocol.parentTerminal!.event).toEqual(terminal);
    expect(await queries(page, actions.slice(2, 4))).toEqual(replay);
    expect(final.head.revision).toBeGreaterThan(continuedHead.head.revision);
    const manualLook = await page.evaluate(async () => {
      const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession;
      return session.execute('exploration', { kind: 'look' });
    });
    const changed = await page.evaluate(() => window.canonicalStartService.snapshot());
    expect(gameCheckpoint(changed.head.checkpoint).knowledge!.sequence).toBe(gameCheckpoint(final.head.checkpoint).knowledge!.sequence + 1);
    expect(changed.head.roots.knowledge).not.toEqual(final.head.roots.knowledge);
    expect(changed.head.roots.world).toEqual(final.head.roots.world);
    expect(changed.head.allocations).toEqual({});
    const retry = await page.evaluate(async ({ actions, binding }) => {
      // @ts-expect-error Original completed SDK hooks only, with fresh command submission forbidden.
      const { retryHistory, historyReadMetrics }: typeof import('./canonical-start-service.history-evidence') = await import('/tests/e2e/canonical-start-service.history-evidence.ts');
      return { ...await retryHistory(actions, binding), meters: historyReadMetrics().fresh };
    }, { actions: actions.slice(2, 4), binding: { grant: continued.selection.value.data.grant, publication: continued.selection.value.data.publication } });
    expect(retry.submissions).toBe(0); expect(retry.meters).toEqual(metrics.fresh);
    for (let i = 0; i < retry.results.length; i++) {
      const result = retry.results[i];
      expect(result.original.result).toEqual(history[i]); expect(result.after).toEqual(result.original);
      expect(result.reconciled).toEqual(history[i]); expect(result.actionResult).toEqual(history[i]);
      expect(JSON.stringify(result.actionResult)).toBe(JSON.stringify(history[i]));
    }
    expect(await queries(page, actions.slice(2, 4))).toEqual(replay);
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(changed);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(frame => frame.type === (adoption ? 'operation.adopt' : 'operation.wake'))).toHaveLength(1);
    expect(wire.sent.filter(frame => [adoption ? 'operation.wake' : 'operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
    expect(wire.received.filter(({ frame }) => frame.type === 'action.request')).toHaveLength(5);
    expect(await serviceProof()).toEqual(counters);
    expect(await plannerHistory()).toEqual(plannerReceived);
    await info.attach('actual-app-history-proof.json', { body: JSON.stringify({ before, after, continuedHead, childAck, final,
      retained, reloaded, continued, finalProtocol, replay, metrics, freshCommits, manualLook, changed, retry, baseline, counters, plannerReceived }, null, 2), contentType: 'application/json' });
  } finally {
    await info.attach('history-final-state.json', { body: JSON.stringify({
      snapshot: await page.evaluate(() => window.canonicalStartService.snapshot()).catch(String),
      host: await page.evaluate(() => {
        const session = Reflect.get(globalThis, '__canonicalStartAppSession');
        return { status: session.view.status, recoveryRequired: session.view.recoveryRequired, diagnostics: session.view.diagnostics };
      }),
      counters: await serviceProof(), plannerReceived: await plannerHistory().catch(String), sent: wire.sent, received: wire.received, http: wire.http,
      alerts: await page.getByRole('alert').allTextContents(),
    }, null, 2), contentType: 'application/json' });
  }
});

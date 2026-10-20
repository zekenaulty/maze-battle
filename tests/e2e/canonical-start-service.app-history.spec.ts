import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';

test.use({ roomProof: true });
const initialWindow = { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 };
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

test('actual App explicitly queries historical decision after room Continue then settles zero-step custody', async ({ page, wire }, info) => {
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
    expect(after.head.roots.world).toEqual(before.head.roots.world);
    const paused = await serviceProof();
    expect(counterDelta(paused, baseline)).toEqual({ created: 1, initial: initialWindow, successor: absentWindow });
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    expect(await serviceProof()).toEqual(paused);
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(after);

    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
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
    const wake = wire.sent.find(frame => frame.type === 'operation.wake')!.payload;
    expect(wake).toEqual(continued.claim.decision.data.event);
    expect(wake.observation.data.scope).toBe('actor'); expect(wake.observation.data.navigation).toBeUndefined();
    expect(wake.observation).not.toEqual(terminal.observation);
    const actor = wake.observation.data.actor;
    expect(actions[4].arguments).toEqual({ level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
    const history = replies.slice(2, 4);
    for (const reply of history) {
      expect(reply.operation).toBeUndefined();
      expect(reply.observation.data).toEqual({ scope: 'decision', state: 'historical', event: terminal });
      expect(JSON.stringify(reply.observation.data.event)).toBe(JSON.stringify(terminal));
    }
    expect(history[0].observation.observationId).not.toBe(history[1].observation.observationId);
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
        previous: { intent: continued.claim.decision.reference } });
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
    expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(final);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
    expect(wire.sent.filter(frame => ['operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
    expect(wire.received.filter(({ frame }) => frame.type === 'action.request')).toHaveLength(5);
    expect(await serviceProof()).toEqual(counters);
    await info.attach('actual-app-history-proof.json', { body: JSON.stringify({ before, after, continuedHead, childAck, final,
      retained, continued, finalProtocol, replay, baseline, counters }, null, 2), contentType: 'application/json' });
  } finally {
    await info.attach('history-final-state.json', { body: JSON.stringify({
      snapshot: await page.evaluate(() => window.canonicalStartService.snapshot()).catch(String),
      host: await page.evaluate(() => {
        const session = Reflect.get(globalThis, '__canonicalStartAppSession');
        return { status: session.view.status, recoveryRequired: session.view.recoveryRequired, diagnostics: session.view.diagnostics };
      }),
      counters: await serviceProof(), sent: wire.sent, received: wire.received, http: wire.http,
      alerts: await page.getByRole('alert').allTextContents(),
    }, null, 2), contentType: 'application/json' });
  }
});

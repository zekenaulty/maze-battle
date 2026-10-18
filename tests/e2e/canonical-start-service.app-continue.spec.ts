import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, scriptedWindow, absentWindow } from './canonical-start-service.decision.steps';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { Page } from '@playwright/test';

const lifetime = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error Native Vite module path.
  return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appLifetime();
});

test('actual App continues one decision only on explicit input and preserves the same canonical game', async ({ page, wire }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?decisionProof=1');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Test-only inspection of the actual hook-owned session.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot()), initialCounters = await serviceProof();
  expect(await lifetime(page)).toEqual({ sameController: true, sameSignal: true, aborted: false, controlled: true });
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog).toContainText('decision-navigation');
  const objective = 'Navigate using earned knowledge, await my explicit decision, then navigate once more.';
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill(objective);
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  const first = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(counterDelta(await serviceProof(), initialCounters)).toEqual({ created: 1, initial: scriptedWindow, successor: absentWindow });
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
  // Closing and reopening a panel must not spend a continuation or change any stored record.
  const quiet = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  expect(await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence())).toEqual(quiet);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => wire.sent.filter(frame => frame.type === 'operation.wake').length).toBe(1);
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Objective', exact: true })).toHaveValue(objective);
  await expect(dialog.getByRole('status').filter({ hasText: /Execution allowance exhausted\./ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const second = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  expect(counterDelta(counters, initialCounters)).toEqual({ created: 2, initial: scriptedWindow, successor: scriptedWindow });
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload);
  expect(actions.map(action => action.capabilityId)).toEqual([
    'maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate', 'maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate',
  ]);
  expect(actions[7].runId).not.toBe(actions[3].runId);
  expect(actions[7].sessionId).toBe(actions[3].sessionId);
  expect(actions[7].sessionEpoch).toBe(actions[3].sessionEpoch);
  expect(second.launch!.binding).toEqual(first.launch!.binding);
  expect(second.launch!.grant).toEqual(first.launch!.grant);
  expect(second.head.gameId).toBe(before.head.gameId);
  for (const key of ['gameId', 'generation', 'owner', 'epoch'] as const) {
    expect(second.head[key]).toBe(first.head[key]); expect(first.head[key]).toBe(before.head[key]);
  }
  expect(await lifetime(page)).toEqual({ sameController: true, sameSignal: true, aborted: false, controlled: true });
  expect(second.head.roots.world).toEqual(before.head.roots.world);
  expect(second.head.checkpoint.position).not.toEqual(first.head.checkpoint.position);
  const evidence = await page.evaluate(async ([initial, successor]) => {
    // @ts-expect-error Native Vite module path.
    return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appNavigationEvidence(initial, successor);
  }, [actions[3], actions[7]] as unknown as AgenticaAction[]);
  expect(evidence.parent.operation.state).toBe('acknowledged');
  expect(evidence.parent.operation.acknowledgementAttemptId).toEqual(expect.any(String));
  expect(evidence.parent.progress).toMatchObject({ status: 'arrived', steps: 1 });
  expect(evidence.child.progress).toMatchObject({ status: 'arrived', steps: 1 });
  expect(evidence.childTerminal.event.kind).toBe('decision');
  expect(evidence.claim.data.started.runId).toBe(actions[7].runId);
  expect(evidence.selection.value.data.grant).toEqual(evidence.child.confirmation.data.binding.grant);
  expect(wire.sent.find(frame => frame.type === 'operation.wake')!.payload).toEqual(evidence.claim.decision.data.event);
  expect(Object.keys(second.head.allocations).sort()).toEqual([second.launch!.guard.id, evidence.child.operation.id].sort());
  expect(second.head.allocations[evidence.parent.operation.id]).toBeUndefined();
  expect(second.launch!.guard.terminal).toBeUndefined();
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('agentic-continue-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(stopped.head.checkpoint).toEqual(second.head.checkpoint);
  expect(await serviceProof()).toEqual(counters);
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^idle$/ })).toBeVisible();
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(await serviceProof()).toEqual(counters);
  await info.attach('actual-app-continue.json', { body: JSON.stringify({ before, first, second, stopped, evidence, initialCounters, counters,
    sent: wire.sent, received: wire.received, http: wire.http }, null, 2), contentType: 'application/json' });
});

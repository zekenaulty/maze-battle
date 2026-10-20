import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { Page } from '@playwright/test';
import { cleanupFrontier } from './canonical-start-service.frontier-cleanup';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';

const frontierWindow = { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 };
async function pack(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Read-only native test inspection, never delivered to the planner.
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    // @ts-expect-error Native Vite module path.
    const { required, containerHeader, containerItems } = await import('/src/persistence/canonical/roster/records.ts');
    return (await readCanonical(async (pages: Parameters<typeof required>[0]) => {
      const header = containerHeader(await required(pages, 'pack'), 'pack');
      return { header, items: await containerItems(pages, 'pack', header) };
    })).value;
  });
}

test('actual App selects earned frontiers and approaches locally across two explicit decision windows without collecting', async ({ page, wire }, info) => {
  await page.goto('/?frontierProof=1'); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Reuse the actual hook-owned session; no fixture discovery prelude.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot()), initialPack = await pack(page), baseline = await serviceProof();
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Approach an earned frontier, wait, then approach another. Do not collect.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 25_000 });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  const first = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(counterDelta(await serviceProof(), baseline)).toEqual({ created: 1, initial: frontierWindow, successor: absentWindow });
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
  expect(await pack(page)).toEqual(initialPack);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /Execution allowance exhausted\./ })).toBeVisible({ timeout: 25_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const after = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  expect(counterDelta(counters, baseline)).toEqual({ created: 2, initial: frontierWindow, successor: frontierWindow });
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload);
  expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.explore', 'maze.inspect', 'maze.explore']);
  const results = wire.sent.filter(frame => frame.type === 'action.result').map(frame => frame.payload);
  for (const offset of [0, 2]) {
    expect(actions[offset].arguments).toEqual({ scope: 'frontiers' });
    const query = results.find(result => result.actionId === actions[offset].actionId);
    expect(query.observation.data.scope).toBe('frontiers');
    expect(actions[offset + 1].arguments).toEqual({ frontier: query.observation.data.frontiers[0].frontier });
    expect(query.observation.data.frontiers[0].source).toMatchObject({ sequence: expect.any(Number), id: expect.any(String) });
  }
  expect(actions[1].arguments.frontier).not.toBe(actions[3].arguments.frontier);
  const evidence: Awaited<ReturnType<typeof import('./canonical-start-service.app-evidence')['appNavigationEvidence']>> =
    await page.evaluate(async ([initial, successor]) => {
      // @ts-expect-error Read exact original/child custody, not a replacement game or transport.
      return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appNavigationEvidence(initial, successor);
    }, [actions[1], actions[3]] as unknown as AgenticaAction[]);
  for (const operation of [evidence.parent!, evidence.child!]) {
    if (operation.kind !== 'navigation') throw Error('Expected frontier navigation');
    expect(operation.progress.binding.kind).toBe('frontier-approach');
    expect(operation.progress.status).toBe('arrived');
    expect(operation.progress.steps).toBeGreaterThan(1);
    expect(operation.progress.position).toEqual(operation.progress.binding.target);
  }
  expect(evidence.parent!.operation.state).toBe('acknowledged');
  expect(evidence.childTerminal!.event.kind).toBe('decision');
  expect(evidence.childTerminal!.event.summary).toContain('frontier');
  expect(evidence.selection!.value.data.grant).toEqual(evidence.child!.confirmation.data.binding.grant);
  if (evidence.parent?.kind !== 'navigation' || evidence.child?.kind !== 'navigation') throw Error('Expected two frontier operations');
  expect(first.head.checkpoint.position).toEqual(evidence.parent!.progress.binding.target);
  expect(after.head.checkpoint.position).toEqual(evidence.child!.progress.binding.target);
  expect(gameCheckpoint(first.head.checkpoint).knowledge!.sequence).toBeGreaterThan(gameCheckpoint(before.head.checkpoint).knowledge!.sequence);
  expect(gameCheckpoint(after.head.checkpoint).knowledge!.sequence).toBeGreaterThan(gameCheckpoint(first.head.checkpoint).knowledge!.sequence);
  expect(first.head.roots.world).toEqual(before.head.roots.world);
  expect(after.head.roots.world).toEqual(before.head.roots.world);
  expect(after.head.checkpoint.position).not.toEqual(first.head.checkpoint.position);
  expect(first.head.checkpoint.position).not.toEqual(before.head.checkpoint.position);
  for (const key of ['gameId', 'generation', 'owner', 'epoch'] as const) expect(after.head[key]).toBe(before.head[key]);
  expect(await pack(page)).toEqual(initialPack);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
  await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(stopped.head.checkpoint).toEqual(after.head.checkpoint);
  expect(stopped.head.roots.world).toEqual(before.head.roots.world);
  const cleanup = await cleanupFrontier(page, actions[1] as AgenticaAction, actions[3] as AgenticaAction);
  expect(await serviceProof()).toEqual(counters);
  expect(await pack(page)).toEqual(initialPack);
  await info.attach('actual-app-frontiers.json', { body: JSON.stringify({ before, first, after, stopped, cleanup, initialPack, evidence,
    counters, baseline, sent: wire.sent, received: wire.received, http: wire.http }, null, 2), contentType: 'application/json' });
});

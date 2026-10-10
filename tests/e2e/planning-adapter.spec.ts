import { expect, test } from '@playwright/test';
import type {} from './planning-adapter-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/planning-adapter-fixture.html');
  await page.waitForFunction(() => Boolean(window.planning));
});

test('observed-only fake planner completes through real IndexedDB and reconciles original finish after reload', async ({ page }) => {
  test.setTimeout(90000);
  const result = await page.evaluate(() => window.planning.play());
  expect(result.outcome).toMatchObject({ type: 'outcome', status: 'complete' });
  expect(result.frame.checkpoint).toMatchObject({ phase: 'complete', collectedChests: 7, visitedSpaces: 15, clearedSpaces: 15 });
  expect(result.maximumFrame).toBeLessThanOrEqual(131072);
  expect(result.diagnostics.progress).toHaveLength(16);
  await page.reload(); await page.waitForFunction(() => Boolean(window.planning));
  const replay = await page.evaluate(async text => {
    const { setup, api, slot, reconcileRepositoryAction } = window.planning;
    const { session, start } = await setup();
    const old = JSON.parse(text); old.type = 'action.query';
    const before = await api.loadStreamSnapshot(slot);
    const original = await reconcileRepositoryAction(slot, JSON.stringify(old));
    const after = await api.loadStreamSnapshot(slot);
    await session.cancel();
    return { original, unchanged: JSON.stringify(before) === JSON.stringify(after), newScope: start.binding.scopeId };
  }, result.lastRequest);
  expect(replay.original).toMatchObject({ disposition: 'applied', afterRevision: result.frame.checkpoint.revision });
  expect(replay.unchanged).toBe(true);
  expect(replay.newScope).toBe(result.frame.checkpoint.scopeId);
  console.log(JSON.stringify({ evidence: 'same-runtime fake adapter with actual IndexedDB', actions: result.actions, maximumFrame: result.maximumFrame }));
});

test('manual takeover fences service actions but original applied result remains queryable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { session, start } = await window.planning.setup();
    const { api, slot, PLANNING_PROTOCOL } = window.planning;
    const envelope = { protocol: PLANNING_PROTOCOL, binding: start.binding };
    const request = { ...envelope, type: 'action.request', actionId: 'first', expectedRevision: 0, expectedTopologyRevision: 0,
      command: { type: 'move', direction: 'north' } };
    const partial = await session.handle(JSON.stringify(request).slice(0, -1));
    const progress = await session.handle(JSON.stringify({ ...envelope, type: 'progress', sequence: 0, stage: 'planning', summary: JSON.stringify(request) }));
    const before = (await api.loadStreamSnapshot(slot)).checkpoint.revision;
    const applied = await session.handle(JSON.stringify(request));
    await api.claimStreamControl(slot, 'human', start.binding.epoch);
    const blocked = await session.handle(JSON.stringify({ ...request, actionId: 'late', expectedRevision: 1 }));
    const original = await session.handle(JSON.stringify({ ...request, type: 'action.query' }));
    await session.cancel();
    return { partial, progress, before, applied, blocked, original, control: await api.loadStreamControl(slot), snapshot: await api.loadStreamSnapshot(slot) };
  });
  expect(result.partial.type).toBe('error'); expect(result.progress.type).toBe('progress.ack'); expect(result.before).toBe(0);
  expect(result.applied).toMatchObject({ type: 'action.result', result: { disposition: 'applied', afterRevision: 1 } });
  expect(result.blocked.type).toBe('error');
  expect(result.original).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
  expect(result.control?.sessionId).toBe('human');
  expect(result.snapshot.checkpoint.revision).toBe(1);
});

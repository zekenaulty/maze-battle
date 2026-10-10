import { expect, test } from '@playwright/test';
import type {} from './directed-stream-fixture';

const fixture = '/tests/e2e/directed-stream-fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => !!window.directedStream); });

test('cross-tab effect/cancel race has no movement after cancellation acknowledgement', async ({ page, context }) => {
  const original = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'race');
    const pending = await h.pending();
    return { control: h.executor.control, request: pending.state.pending!.request };
  });
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => !!window.directedStream);
  const execution = page.evaluate(original => window.directedStream.durable.executeDurableDirectedStreamMove('directed', original.control,
    { operationId: 'race', actionId: original.request.actionId }), original);
  const stopped = await second.evaluate(control => window.directedStream.durable.stopDurableDirectedStreamTravel('directed', control, 'race'), original.control);
  await execution;
  const result = await page.evaluate(async request => {
    const h = window.directedStream;
    const before = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const replay = await h.api.executeStreamAction('directed', request);
    return { before, replay, after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  }, original.request);
  expect(stopped.record!.state.operation.status).toBe('cancelled');
  expect(stopped.control.epoch).toBeGreaterThan(original.control.epoch);
  expect(result.before).toEqual(stopped.checkpoint);
  expect(result.after).toEqual(stopped.checkpoint);
  expect(result.after.moves).toBeLessThanOrEqual(1);
});

test('public executor cancellation settles or revokes an in-flight step without a late effect', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'public-cancel');
    const moving = h.executor.step();
    const cancellation = h.executor.cancel();
    await moving.catch(() => undefined);
    const cancelled = await cancellation;
    const atAck = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const request = cancelled!.lastAttempt?.request;
    if (request) await h.api.executeStreamAction('directed', request);
    await h.executor.step();
    return { cancelled, atAck, after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  });
  expect(result.cancelled!.state.operation.status).toBe('cancelled');
  expect(result.after).toEqual(result.atAck);
});

test('takeover fences old execution without revoking the new owner', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'takeover');
    const pending = await h.pending(), old = h.executor.control;
    const winner = await h.api.claimStreamControl('directed', 'new-owner', old.epoch);
    const record = await h.durable.executeDurableDirectedStreamMove('directed', old,
      { operationId: 'takeover', actionId: pending.state.pending!.request.actionId });
    return { winner, record, afterControl: await h.api.loadStreamControl('directed'), checkpoint: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  });
  expect(result.record.state.paused).toBe(true);
  expect(result.record.lastAttempt!.outcome).toBe('revoked');
  expect(result.afterControl).toEqual(result.winner);
  expect(result.checkpoint.moves).toBe(0);
});

test('an unrelated caller cannot retire a valid pending request or silently adopt another owner', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'owner-boundary');
    const pending = await h.pending(), before = await h.raw(), original = h.executor.control;
    let error = '';
    try {
      await h.durable.executeDurableDirectedStreamMove('directed', { sessionId: 'unrelated', epoch: original.epoch },
        { operationId: 'owner-boundary', actionId: pending.state.pending!.request.actionId });
    } catch (failure) { error = String(failure); }
    const after = await h.raw();
    const winner = await h.api.claimStreamControl('directed', 'winner', original.epoch);
    await h.executor.step().catch(() => undefined);
    let navigateError = '';
    try { await h.executor.navigate(target, 'must-not-adopt'); } catch (failure) { navigateError = String(failure); }
    return { error, before, after, original, winner, runtimeControl: h.executor.control, navigateError,
      current: await h.api.loadStreamControl('directed') };
  });
  expect(result.error).toContain('owner mismatch');
  expect(result.after).toEqual(result.before);
  expect(result.runtimeControl).toEqual(result.original);
  expect(result.current).toEqual(result.winner);
  expect(result.navigateError).toContain('owner changed');
});

test('an intervening manual move invalidates the directed pending revision without an extra move', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'manual-change');
    const pending = await h.pending(), owner = h.executor.control;
    const changed = await h.act({ type: 'move', direction: 'north' });
    const record = await h.durable.executeDurableDirectedStreamMove('directed', owner,
      { operationId: 'manual-change', actionId: pending.state.pending!.request.actionId });
    return { changed: changed.checkpoint, record, after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  });
  expect(result.record.state.paused).toBe(true);
  expect(result.record.state.operation.steps).toBe(0);
  expect(result.after).toEqual(result.changed);
});

test('expired pending attempts are revoked; expiry during effect processing rolls back the whole transaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'deadline');
    const pending = await h.pending(), request = pending.state.pending!.request;
    const before = await h.raw();
    let calls = 0, error = '';
    try {
      await h.durable.executeDurableDirectedStreamMove('directed', h.executor.control, { operationId: 'deadline', actionId: request.actionId }, undefined,
        () => ++calls === 1 ? pending.state.operation.startedAt + 1 : pending.state.operation.deadline);
    } catch (failure) { error = String(failure); }
    const rollback = await h.raw();
    const revoked = await h.durable.executeDurableDirectedStreamMove('directed', h.executor.control,
      { operationId: 'deadline', actionId: request.actionId }, undefined, () => pending.state.operation.deadline);
    const late = await h.api.executeStreamAction('directed', request);
    return { before, rollback, error, revoked, late, receipt: await h.api.loadStreamAction('directed', request) };
  });
  expect(result.error).toContain('deadline');
  expect(result.rollback).toEqual(result.before);
  expect(result.revoked.state.paused).toBe(true);
  expect(result.revoked.lastAttempt!.outcome).toBe('revoked');
  expect(result.late.disposition).toBe('conflict');
  expect(result.receipt).toBeUndefined();
});

test('corrupted pending non-movement commands are rejected before any effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'corrupt-command');
    const pending = await h.pending(), request = pending.state.pending!.request;
    const db = await h.openDB(h.TOPOLOGY_DATABASE);
    const record = await db.get('directedStreamOperations', ['directed', 'corrupt-command']);
    record.state.pending.request.command = { type: 'collect' };
    await db.put('directedStreamOperations', record, ['directed', 'corrupt-command']); db.close();
    let error = '';
    try { await h.durable.executeDurableDirectedStreamMove('directed', h.executor.control, { operationId: 'corrupt-command', actionId: request.actionId }); }
    catch (failure) { error = String(failure); }
    return { error, checkpoint: (await h.api.loadStreamSnapshot('directed')).checkpoint,
      receipt: await h.api.loadStreamAction('directed', request) };
  });
  expect(result.error).toContain('pending request');
  expect(result.checkpoint.moves).toBe(0);
  expect(result.checkpoint.collectedChests).toBe(0);
  expect(result.receipt).toBeUndefined();
});

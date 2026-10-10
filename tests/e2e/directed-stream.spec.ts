import { expect, test } from '@playwright/test';
import type {} from './directed-stream-fixture';
import { TOPOLOGY_DATABASE_VERSION } from '../../src/persistence/topology/database';

const fixture = '/tests/e2e/directed-stream-fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => !!window.directedStream); });

test('durable executor crosses three observed generated rooms to an unloaded chest, with bounded point reads and residency', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target, rooms, checkpoint } = await h.setupThree();
    const started = await h.trace(() => h.executor.navigate(target, 'known-chest'));
    const beforeLoads = h.executor.residency.loads;
    const positions = [checkpoint.position.spaceId], kinds: string[] = [];
    let maximumCells = 0;
    let record = started.result;
    for (let i = 0; i < 70 && record.state.operation.status === 'running'; i++) {
      const step = await h.trace(() => h.executor.step());
      record = step.result!;
      positions.push(record.state.frame.checkpoint.position.spaceId);
      maximumCells = Math.max(maximumCells, h.executor.residency.residentCells);
      if (record.lastAttempt) kinds.push(record.lastAttempt.request.command.type);
      if ((step.reads.spaces ?? 0) > 2) throw new Error('Loaded beyond the immediate source/destination');
    }
    const after = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const chest = (await h.api.readStreamKnowledge('directed', target.address.spaceId))!.chests;
    const raw = await h.raw();
    return { startedReads: started.reads, beforeLoads, record, roomsCrossed: rooms.filter(room => positions.includes(room)),
      target, kinds, maximumCells, checkpoint, after, chest, raw };
  });
  expect(result.startedReads.spaces ?? 0).toBe(0);
  expect(result.startedReads.streamKnowledge).toBeGreaterThanOrEqual(5);
  expect(result.beforeLoads).toBe(0);
  expect(result.roomsCrossed).toHaveLength(3);
  expect(result.record.state.operation.status).toBe('arrived');
  expect(result.record.state.operation.steps).toBeGreaterThan(4);
  expect(result.maximumCells).toBeLessThanOrEqual(512);
  expect(result.after.position).toEqual(result.target.address);
  expect(result.after.topologyRevision).toBe(result.checkpoint.topologyRevision);
  expect(result.after.collectedChests).toBe(result.checkpoint.collectedChests);
  expect(result.after.visitedSpaces).toBe(result.checkpoint.visitedSpaces);
  expect(result.after.phase).toBe('exploring');
  expect(result.kinds.every(kind => kind === 'move')).toBe(true);
  expect(Object.values(result.chest).every(chest => !chest.opened)).toBe(true);
  expect(result.raw.records.find(row => row.store === 'roots')!.value.serializedBytes).toBe(result.raw.bytes);
});

test('reload retires an unexecuted original request, stays paused, and fences any late raw dispatch', async ({ page }) => {
  const pending = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'pending-reload'); return h.pending();
  });
  const request = pending.state.pending!.request;
  await page.reload(); await page.waitForFunction(() => !!window.directedStream);
  const result = await page.evaluate(async request => {
    const h = window.directedStream;
    await h.open();
    const before = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const state = await h.executor.step();
    const late = await h.api.executeStreamAction('directed', request);
    return { before, state, late, after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  }, request);
  expect(result.state!.state.paused).toBe(true);
  expect(result.state!.state.operation.steps).toBe(0);
  expect(result.state!.state.pending).toBeUndefined();
  expect(result.state!.lastAttempt).toEqual({ outcome: 'revoked', request });
  expect(result.late.disposition).toBe('conflict');
  expect(result.after).toEqual(result.before);
});

test('atomic effect/settlement survives lost acknowledgement and exact duplicate execution', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'ack-loss');
    const pending = await h.pending(), request = pending.state.pending!.request;
    await h.durable.executeDurableDirectedStreamMove('directed', h.executor.control,
      { operationId: 'ack-loss', actionId: request.actionId });
    return { request, control: h.executor.control };
  });
  await page.reload(); await page.waitForFunction(() => !!window.directedStream);
  const result = await page.evaluate(async original => {
    const h = window.directedStream;
    await h.open();
    const before = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const duplicate = await h.durable.executeDurableDirectedStreamMove('directed', original.control,
      { operationId: 'ack-loss', actionId: original.request.actionId });
    const receipt = await h.api.loadStreamAction('directed', original.request);
    await h.executor.step();
    return { before, duplicate, receipt, after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  }, original);
  expect(result.duplicate.state.operation.steps).toBe(1);
  expect(result.duplicate.state.paused).toBe(true);
  expect(result.duplicate.lastAttempt).toEqual({ outcome: 'settled', request: original.request, result: result.receipt!.result });
  expect(result.after).toEqual(result.before);
});

test('reload reconciles a staged original stream receipt without redispatching it', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'legacy-ack');
    const pending = await h.pending(), request = pending.state.pending!.request;
    const result = await h.api.executeStreamAction('directed', request);
    return { request, result };
  });
  await page.reload(); await page.waitForFunction(() => !!window.directedStream);
  const record = await page.evaluate(() => window.directedStream.open());
  expect(record!.state.paused).toBe(true);
  expect(record!.state.pending).toBeUndefined();
  expect(record!.state.operation.steps).toBe(1);
  expect(record!.lastAttempt).toEqual({ ...original, outcome: 'settled' });
});

test('cancellation acknowledges only after the pending request epoch is revoked', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'cancel-pending');
    const pending = await h.pending(), request = pending.state.pending!.request;
    const cancelled = await h.executor.cancel();
    const before = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const late = await h.api.executeStreamAction('directed', request);
    const again = await h.executor.step();
    return { request, cancelled, before, late, again, epoch: h.executor.control.epoch,
      after: (await h.api.loadStreamSnapshot('directed')).checkpoint };
  });
  expect(result.cancelled!.state.operation.status).toBe('cancelled');
  expect(result.epoch).toBeGreaterThan(result.request.epoch);
  expect(result.cancelled!.lastAttempt).toEqual({ outcome: 'revoked', request: result.request });
  expect(result.late.disposition).toBe('conflict');
  expect(result.after).toEqual(result.before);
});

test('an IDB settlement write failure rolls back the effect and receipt together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream, { target } = await h.setup(); await h.open();
    await h.executor.navigate(target, 'rollback');
    const pending = await h.pending(), request = pending.state.pending!.request;
    const before = await h.raw();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'directedStreamOperations') throw new Error('Injected operation settlement failure');
      return put.call(this, value, key);
    };
    let error = '';
    try { await h.durable.executeDurableDirectedStreamMove('directed', h.executor.control, { operationId: 'rollback', actionId: request.actionId }); }
    catch (failure) { error = String(failure); }
    finally { IDBObjectStore.prototype.put = put; }
    return { error, before, after: await h.raw(), receipt: await h.api.loadStreamAction('directed', request) };
  });
  expect(result.error).toContain('Injected');
  expect(result.receipt).toBeUndefined();
  expect(result.after).toEqual(result.before);
});

test('additive v3 migration preserves every old stream record and normal stream movement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.directedStream; await h.setup('old-stream');
    const old = await h.downgradeFixtureToV3();
    await h.api.loadStreamSnapshot('old-stream');
    const upgraded = await h.raw();
    const moved = await h.act({ type: 'move', direction: 'west' }, 'old-stream');
    return { old, upgraded, moved };
  });
  expect(result.upgraded.version).toBe(TOPOLOGY_DATABASE_VERSION);
  expect(result.upgraded.records).toEqual(result.old);
  expect(result.moved.checkpoint.moves).toBe(1);
});

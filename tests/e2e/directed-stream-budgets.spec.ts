import { expect, test } from '@playwright/test';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import type {} from './directed-stream-fixture';

const finite: DestinationLimits = { steps: 96, replans: 8, durationMs: 30_000 };
const unlimited: DestinationLimits = { steps: null, replans: null, durationMs: null };
const changed: DestinationLimits = { steps: 1, replans: 0, durationMs: 1 };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.deleteDatabase = () => { throw new Error('Database deletion forbidden'); };
  });
  await page.goto('/tests/e2e/directed-stream-fixture.html');
  await page.waitForFunction(() => !!window.directedStream);
});

for (const limits of [finite, unlimited]) {
  test(`${limits.steps === null ? 'unlimited' : 'finite'} stream policy persists across reload, replay and a changed new-start policy`, async ({ page }) => {
    const original = await page.evaluate(async ({ limits, changed }) => {
      const h = window.directedStream, { target, control } = await h.setup('budgets');
      const started = await h.durable.startDurableDirectedStreamTravel('budgets', control, { id: 'trip', target }, () => 1000, limits);
      Object.assign(limits, changed);
      const pending = await h.durable.prepareDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', revision: started.revision, actionId: 'step-0' }, () => 1001);
      const moved = await h.durable.executeDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', actionId: 'step-0' }, undefined, () => 1001);
      const beforeChange = await h.raw();
      let error = '';
      try { await h.durable.startDurableDirectedStreamTravel('budgets', control, { id: 'replacement', target }, () => 1002, changed); }
      catch (cause) { error = String(cause); }
      return { target, control, started, request: pending.state.pending!.request, moved, beforeChange, error, afterChange: await h.raw() };
    }, { limits, changed });
    const deadline = limits.durationMs === null ? null : 1000 + limits.durationMs;
    expect(original.started.state.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 0, replans: 0, nextStep: 0, status: 'running' });
    expect(original.moved.state.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 1, replans: 0, nextStep: 1, status: 'running' });
    expect(original.error).toContain('cancel the active intention first');
    expect(original.afterChange).toEqual(original.beforeChange);

    await page.reload();
    await page.waitForFunction(() => !!window.directedStream);
    const result = await page.evaluate(async ({ control, request, changed, now }) => {
      const h = window.directedStream, before = await h.raw();
      const read = await h.durable.loadDirectedStreamSession('budgets');
      const replay = await h.durable.executeDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', actionId: 'step-0' }, undefined, () => { throw new Error('Replay sampled the clock'); });
      const receipt = await h.api.loadStreamAction('budgets', request);
      const afterReplay = await h.raw();
      const pending = await h.durable.prepareDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', revision: read.record!.revision, actionId: 'step-1' }, () => now);
      const next = await h.durable.executeDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', actionId: pending.state.pending!.request.actionId }, undefined, () => now);
      let finished = next;
      for (let i = 0; i < 16 && finished.state.operation.status === 'running'; i++) {
        const actionId = `finish-${i}`;
        await h.durable.prepareDurableDirectedStreamMove('budgets', control,
          { operationId: 'trip', revision: finished.revision, actionId }, () => now);
        finished = await h.durable.executeDurableDirectedStreamMove('budgets', control,
          { operationId: 'trip', actionId }, undefined, () => now);
      }
      const checkpoint = (await h.api.loadStreamSnapshot('budgets')).checkpoint;
      const fresh = await h.durable.startDurableDirectedStreamTravel('budgets', control,
        { id: 'fresh', target: { kind: 'cell', address: checkpoint.position, arrival: 'occupy' } }, () => now + 1, changed);
      const beforeOldRead = await h.raw();
      const old = await h.durable.loadDirectedStreamSession('budgets', 'trip');
      const oldReplay = await h.durable.executeDurableDirectedStreamMove('budgets', control,
        { operationId: 'trip', actionId: finished.lastAttempt!.request.actionId }, undefined,
        () => { throw new Error('Historical replay sampled the clock'); });
      return { before, read, replay, receipt, afterReplay, next, finished, checkpoint, fresh, old, oldReplay,
        beforeOldRead, afterOldRead: await h.raw() };
    }, { control: original.control, request: original.request, changed, now: limits.durationMs === null ? 500_000 : 1002 });
    expect(result.read.record).toEqual(original.moved);
    expect(result.replay).toEqual(original.moved);
    expect(result.replay.lastAttempt).toEqual({ outcome: 'settled', request: original.request, result: result.receipt!.result });
    expect(result.afterReplay).toEqual(result.before);
    expect(result.next.state.operation).toMatchObject({ limits, deadline, startedAt: 1000, steps: 2, replans: 0, nextStep: 2 });
    expect(result.finished.state.operation).toMatchObject({ limits, deadline, status: 'arrived' });
    expect(result.checkpoint.position).toEqual(original.target.address);
    expect(result.checkpoint.collectedChests).toBe(0);
    expect(result.checkpoint.topologyRevision).toBe(original.started.state.frame.checkpoint.topologyRevision);
    expect(result.fresh.state.operation).toMatchObject({ limits: changed, steps: 0, replans: 0, nextStep: 0, status: 'arrived',
      deadline: result.fresh.state.operation.startedAt + 1 });
    expect(result.old.record).toEqual(result.finished);
    expect(result.oldReplay).toEqual(result.finished);
    expect(result.afterOldRead).toEqual(result.beforeOldRead);
    expect(result.afterOldRead.records.find(row => row.store === 'roots')!.value.serializedBytes).toBe(result.afterOldRead.bytes);
  });
}

for (const offset of [0, 1]) {
  test(`custom finite stream pending move expires at deadline + ${offset} without effects after reload`, async ({ page }) => {
    const original = await page.evaluate(async () => {
      const h = window.directedStream, { target, control } = await h.setup('expiry');
      const started = await h.durable.startDurableDirectedStreamTravel('expiry', control, { id: 'trip', target }, () => 1000,
        { steps: 96, replans: 8, durationMs: 5 });
      const pending = await h.durable.prepareDurableDirectedStreamMove('expiry', control,
        { operationId: 'trip', revision: started.revision, actionId: 'expired-step' }, () => 1001);
      return { control, pending, before: await h.raw() };
    });
    await page.reload();
    await page.waitForFunction(() => !!window.directedStream);
    const result = await page.evaluate(async ({ control, request, offset }) => {
      const h = window.directedStream;
      const read = await h.durable.loadDirectedStreamSession('expiry');
      const expired = await h.durable.executeDurableDirectedStreamMove('expiry', control,
        { operationId: 'trip', actionId: 'expired-step' }, undefined, () => 1005 + offset);
      const atExpiry = await h.raw();
      const late = await h.api.executeStreamAction('expiry', request);
      const replay = await h.durable.executeDurableDirectedStreamMove('expiry', control,
        { operationId: 'trip', actionId: 'expired-step' }, undefined, () => { throw new Error('Replay sampled the clock'); });
      return { read, expired, atExpiry, late, replay, receipt: await h.api.loadStreamAction('expiry', request), after: await h.raw() };
    }, { control: original.control, request: original.pending.state.pending!.request, offset });
    expect(result.read.record).toEqual(original.pending);
    expect(result.expired.state.operation).toMatchObject({ limits: { steps: 96, replans: 8, durationMs: 5 },
      startedAt: 1000, deadline: 1005, steps: 0, replans: 0, nextStep: 1 });
    expect(result.expired.state.paused).toBe(true);
    expect(result.expired.state.pending).toBeUndefined();
    expect(result.expired.lastAttempt).toEqual({ outcome: 'revoked', request: original.pending.state.pending!.request });
    const effectRecords = (raw: typeof original.before) => raw.records.filter(row => !['roots', 'streamControls', 'directedStreamOperations'].includes(row.store));
    expect(effectRecords(result.atExpiry)).toEqual(effectRecords(original.before));
    expect(result.late.disposition).toBe('conflict');
    expect(result.receipt).toBeUndefined();
    expect(result.replay).toEqual(result.expired);
    expect(result.after).toEqual(result.atExpiry);
  });
}

for (const fence of ['cancel', 'takeover'] as const) {
  test(`${fence} still revokes unlimited pending stream movement after reload`, async ({ page }) => {
    const original = await page.evaluate(async unlimited => {
      const h = window.directedStream, { target, control } = await h.setup('fence');
      const started = await h.durable.startDurableDirectedStreamTravel('fence', control, { id: 'trip', target }, () => 1000, unlimited);
      const pending = await h.durable.prepareDurableDirectedStreamMove('fence', control,
        { operationId: 'trip', revision: started.revision, actionId: 'late-step' }, () => 500_000);
      return { control, pending, before: await h.raw(), checkpoint: (await h.api.loadStreamSnapshot('fence')).checkpoint };
    }, unlimited);
    expect(original.pending.state.operation).toMatchObject({ limits: unlimited, deadline: null, nextStep: 1, steps: 0 });
    expect(original.pending.state.pending).toBeDefined();
    await page.reload();
    await page.waitForFunction(() => !!window.directedStream);
    const result = await page.evaluate(async ({ control, request, fence }) => {
      const h = window.directedStream;
      const winner = fence === 'cancel'
        ? (await h.durable.stopDurableDirectedStreamTravel('fence', control, 'trip')).control
        : await h.api.claimStreamControl('fence', 'owner-b', control.epoch);
      const settled = await h.durable.executeDurableDirectedStreamMove('fence', control,
        { operationId: 'trip', actionId: 'late-step' }, undefined, () => 600_000);
      const atFence = await h.raw();
      const late = await h.api.executeStreamAction('fence', request);
      let prepareError = '';
      try { await h.durable.prepareDurableDirectedStreamMove('fence', control,
        { operationId: 'trip', revision: settled.revision, actionId: 'must-not-move' }, () => 600_001); }
      catch (cause) { prepareError = String(cause); }
      return { winner, settled, atFence, late, prepareError, current: await h.api.loadStreamControl('fence'),
        checkpoint: (await h.api.loadStreamSnapshot('fence')).checkpoint, receipt: await h.api.loadStreamAction('fence', request), after: await h.raw() };
    }, { control: original.control, request: original.pending.state.pending!.request, fence });
    expect(result.settled.state.operation).toMatchObject({ limits: unlimited, deadline: null, startedAt: 1000, steps: 0, replans: 0, nextStep: 1 });
    if (fence === 'cancel') expect(result.settled.state.operation.status).toBe('cancelled');
    expect(result.settled.state.paused).toBe(true);
    expect(result.settled.state.pending).toBeUndefined();
    expect(result.settled.lastAttempt).toEqual({ outcome: 'revoked', request: original.pending.state.pending!.request });
    expect(result.winner.epoch).toBeGreaterThan(original.control.epoch);
    expect(result.current).toEqual(result.winner);
    expect(result.prepareError).toContain('custody changed');
    expect(result.late.disposition).toBe('conflict');
    expect(result.receipt).toBeUndefined();
    expect(result.checkpoint).toEqual(original.checkpoint);
    const effectRecords = (raw: typeof original.before) => raw.records.filter(row => !['roots', 'streamControls', 'directedStreamOperations'].includes(row.store));
    expect(effectRecords(result.atFence)).toEqual(effectRecords(original.before));
    expect(result.after).toEqual(result.atFence);
  });
}

test('unlimited stream arrival at an actor-known chest never collects or interacts', async ({ page }) => {
  const result = await page.evaluate(async unlimited => {
    const h = window.directedStream, { target, checkpoint } = await h.setupThree();
    const control = h.executor.control;
    let record = await h.durable.startDurableDirectedStreamTravel('directed', control, { id: 'chest-trip', target }, () => 1000, unlimited);
    const commands: string[] = [];
    for (let i = 0; i < 128 && record.state.operation.status === 'running'; i++) {
      const actionId = `chest-step-${i}`;
      record = await h.durable.prepareDurableDirectedStreamMove('directed', control,
        { operationId: 'chest-trip', revision: record.revision, actionId }, () => 500_000 + i);
      if (!record.state.pending) break;
      commands.push(record.state.pending.request.command.type);
      record = await h.durable.executeDurableDirectedStreamMove('directed', control,
        { operationId: 'chest-trip', actionId }, undefined, () => 500_000 + i);
    }
    const after = (await h.api.loadStreamSnapshot('directed')).checkpoint;
    const chest = (await h.api.readStreamKnowledge('directed', target.address.spaceId))!.chests;
    return { record, commands, target, checkpoint, after, chest };
  }, unlimited);
  expect(result.record.state.operation).toMatchObject({ limits: unlimited, deadline: null, status: 'arrived' });
  expect(result.commands.length).toBeGreaterThan(0);
  expect(result.commands.every(type => type === 'move')).toBe(true);
  expect(result.after.position).toEqual(result.target.address);
  expect(result.after.collectedChests).toBe(result.checkpoint.collectedChests);
  expect(result.after.visitedSpaces).toBe(result.checkpoint.visitedSpaces);
  expect(result.after.topologyRevision).toBe(result.checkpoint.topologyRevision);
  expect(result.after.phase).toBe('exploring');
  expect(Object.values(result.chest).every(chest => !chest.opened)).toBe(true);
});

test('legacy stream limits remain absent on read/replay and retain the default expiry without migration', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const h = window.directedStream, { target, control } = await h.setup('legacy');
    const started = await h.durable.startDurableDirectedStreamTravel('legacy', control, { id: 'trip', target }, () => 1000);
    await h.durable.prepareDurableDirectedStreamMove('legacy', control,
      { operationId: 'trip', revision: started.revision, actionId: 'step-0' }, () => 1001);
    await h.durable.executeDurableDirectedStreamMove('legacy', control,
      { operationId: 'trip', actionId: 'step-0' }, undefined, () => 1001);
    // Remove only the new field from this isolated fixture, maintaining native byte accounting.
    const db = await h.openDB(h.TOPOLOGY_DATABASE);
    try {
      const tx = db.transaction(['directedStreamOperations', 'roots'], 'readwrite');
      const store = tx.objectStore('directedStreamOperations'), key = ['legacy', 'trip'];
      const record = await store.get(key), root = await tx.objectStore('roots').get('legacy');
      const bytes = (store: string, key: unknown, value: unknown) => new TextEncoder().encode(JSON.stringify([store, key, value])).byteLength;
      const beforeBytes = bytes('directedStreamOperations', key, record);
      delete record.state.operation.limits;
      const otherBytes = root.serializedBytes - bytes('roots', 'legacy', root)
        + bytes('directedStreamOperations', key, record) - beforeBytes;
      for (let i = 0; i < 16; i++) {
        const total = otherBytes + bytes('roots', 'legacy', root);
        if (total === root.serializedBytes) break;
        root.serializedBytes = total;
      }
      await store.put(record, key);
      await tx.objectStore('roots').put(root, 'legacy');
      await tx.done;
      return { started, control, record, raw: await h.raw() };
    } finally { db.close(); }
  });
  expect(original.started.state.operation).toMatchObject({ limits: { steps: 64, replans: 4, durationMs: 120_000 }, deadline: 121_000 });
  expect(original.raw.records.find(row => row.store === 'roots')!.value.serializedBytes).toBe(original.raw.bytes);
  await page.reload();
  await page.waitForFunction(() => !!window.directedStream);
  const result = await page.evaluate(async control => {
    const h = window.directedStream;
    const read = await h.durable.loadDirectedStreamSession('legacy');
    const replay = await h.durable.executeDurableDirectedStreamMove('legacy', control,
      { operationId: 'trip', actionId: 'step-0' }, undefined, () => { throw new Error('Replay sampled the clock'); });
    const afterReads = await h.raw();
    const stopped = await h.durable.prepareDurableDirectedStreamMove('legacy', control,
      { operationId: 'trip', revision: read.record!.revision, actionId: 'expired-step' }, () => 121_000);
    return { read, replay, afterReads, stopped, after: await h.raw() };
  }, original.control);
  expect(result.read.record).toEqual(original.record);
  expect(result.read.record!.state.operation).not.toHaveProperty('limits');
  expect(result.replay).toEqual(original.record);
  expect(result.afterReads).toEqual(original.raw);
  expect(result.stopped.state.operation).toMatchObject({ deadline: 121_000, steps: 1, replans: 0, nextStep: 2,
    status: 'interrupted', reason: 'Travel time budget exhausted.' });
  expect(result.stopped.state.pending).toBeUndefined();
  const effectRecords = (raw: typeof original.raw) => raw.records.filter(row => !['roots', 'directedStreamOperations'].includes(row.store));
  expect(effectRecords(result.after)).toEqual(effectRecords(original.raw));
});

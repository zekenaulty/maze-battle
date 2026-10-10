import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';

const fixture = '/src/persistence/agenticaTest.fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.agenticaStorage)); });

for (const fence of ['takeover', 'expiry'] as const) test(`pending liveness after ${fence}: atomically settle without any game effect`, async ({ page }) => {
  const result = await page.evaluate(async fence => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    if (fence === 'takeover') {
      await window.stream.act({ type: 'move', direction: 'south' });
      await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    }
    const before = await window.stream.raw(), put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete;
    const writes: string[] = [], now = Date.now;
    if (fence === 'expiry') Date.now = () => Date.parse(input.deadlineAt) + 1;
    IDBObjectStore.prototype.put = function (value, key) { writes.push(this.name); return put.call(this, value, key!); };
    IDBObjectStore.prototype.delete = function () { throw new Error('Settlement must not delete receipts'); };
    let measured;
    try { measured = await window.stream.trace(() => api.settleAgenticaAction('stream', input)); }
    finally { Date.now = now; IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.delete = remove; }
    const settled = measured.result!;
    await api.saveAgenticaAction('stream', sdk.actionKey(input), { status: 'completed', fingerprint: sdk.actionFingerprint(input), result: settled });
    await reserve(input); // A late SDK pending save must not undo settlement.
    const after = await window.stream.raw();
    return { input, settled, before, after, writes, reads: measured.total,
      replay: await api.executeAgenticaAction('stream', input), query: await api.reconcileAgenticaAction('stream', input) };
  }, fence);
  expect(result.settled.disposition).toBe(fence === 'takeover' ? 'conflict' : 'unavailable');
  expect(result.settled.beforeRevision).toBe(fence === 'takeover' ? 1 : 0);
  expect(result.settled.afterRevision).toBe(result.settled.beforeRevision);
  expect(result.settled.observation!.revision).toBe(result.settled.afterRevision);
  expect(result.writes.sort()).toEqual(['agenticaActions', 'roots']); expect(result.reads).toBeLessThanOrEqual(12);
  expect(result.after.records.filter(record => !['agenticaActions', 'roots'].includes(record.store)))
    .toEqual(result.before.records.filter(record => !['agenticaActions', 'roots'].includes(record.store)));
  expect(result.after.records.find(record => record.store === 'roots')!.value.serializedBytes).toBe(result.after.bytes);
  expect(result.replay).toEqual(result.settled); expect(result.query).toEqual(result.settled);
  await page.reload(); await page.waitForFunction(() => Boolean(window.agenticaStorage));
  expect(await page.evaluate(input => window.agenticaStorage.api.settleAgenticaAction('stream', input), result.input)).toEqual(result.settled);
  expect(await page.evaluate(() => window.stream.raw())).toEqual(result.after);
});

test('missing or still-live reservations remain untouched, even after checkpoint/topology revision drift', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, topologyTransaction } = window.agenticaStorage; await setup();
    const missing = await action('maze.move', { direction: 'north' }), input = await action('maze.prepare', { frontierId: 'socket-0' });
    await reserve(input);
    const stale = await action('maze.observe', { topologyRevision: 999 }); await reserve(stale);
    await window.stream.act({ type: 'move', direction: 'south' });
    const before = await window.stream.raw();
    const replies = await Promise.all([missing, input, stale].map(value => api.settleAgenticaAction('stream', value)));
    const after = await window.stream.raw();
    // Missing ownership history is not a proven takeover.
    await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!; await tx.put('streamControls', ['stream'], undefined); await tx.stageRoot('stream', root);
    });
    const withoutControl = await window.stream.raw(), unknown = await api.settleAgenticaAction('stream', input);
    return { replies, before, after, unknown, withoutControl, afterUnknown: await window.stream.raw() };
  });
  expect(result.replies).toEqual([undefined, undefined, undefined]); expect(result.after).toEqual(result.before);
  expect(result.unknown).toBeUndefined(); expect(result.afterUnknown).toEqual(result.withoutControl);
});

test('committed original never expires or needs present ownership, and reconciliation stays query-only', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, topologyTransaction } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    const original = await api.executeAgenticaAction('stream', input);
    const pending = await action('maze.move', { direction: 'south' }); await reserve(pending);
    await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    const beforeQuery = await window.stream.raw(), query = await api.reconcileAgenticaAction('stream', pending);
    if (JSON.stringify(beforeQuery) !== JSON.stringify(await window.stream.raw())) throw new Error('Reconciliation wrote data');
    await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!; await tx.put('streamControls', ['stream'], undefined); await tx.stageRoot('stream', root);
    });
    const before = await window.stream.raw(), now = Date.now;
    Date.now = () => Date.parse(input.deadlineAt) + 1_000_000;
    let measured;
    try { measured = await window.stream.trace(() => api.settleAgenticaAction('stream', input)); } finally { Date.now = now; }
    return { original, query, measured, before, after: await window.stream.raw() };
  });
  expect(result.query).toBeUndefined(); expect(result.measured.result).toEqual(result.original); expect(result.after).toEqual(result.before);
  expect(result.measured.total).toBe(5); expect(result.measured.reads.streamControls).toBeUndefined(); expect(result.measured.reads.spaces).toBeUndefined();
});

import { test, expect } from '@playwright/test';
import type {} from './gameplay-telemetry-native.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5581' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/gameplay-telemetry-native.html');
  await page.waitForFunction(() => !!window.nativeTelemetry);
});

test('native ring eviction stays fixed64, snapshot-pinned and read-only after reload; receipt replay appends nothing', async ({ page }, info) => {
  const prepared = await page.evaluate(async () => {
    const c = window.nativeTelemetry, { head: initial } = await c.initializeCanonical('telemetry-owner', { walletGold: 0 });
    const initialSnapshot = c.snapshotOf(initial), empty = await c.readGameplayTelemetry(initialSnapshot);
    let head = initial, oldSnapshot = initialSnapshot, last: Awaited<ReturnType<typeof c.append>>;
    for (let sequence = 1; sequence <= 70; sequence++) {
      last = await c.append(head, sequence); head = last.result.head!;
      if (sequence === 6) oldSnapshot = c.snapshotOf(head);
    }
    return { initialSnapshot, empty, oldSnapshot, snapshot: c.snapshotOf(head), last: last!, before: await c.audit() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.nativeTelemetry);
  const result = await page.evaluate(async wire => {
    const saved = JSON.parse(wire) as typeof prepared;
    const c = window.nativeTelemetry, meter = c.boundedReaderProbe();
    let current: Awaited<ReturnType<typeof c.readGameplayTelemetry>>, io: ReturnType<typeof meter.finish>;
    try { current = await c.readGameplayTelemetry(saved.snapshot); } finally { io = meter.finish(); }
    const keys: string[] = [];
    const bounded = await c.readCanonical((pages, snapshot) => c.loadGameplayTelemetry({ get: (area, key) => {
      keys.push(`${area}:${key}`); return pages.get(area, key);
    } }, snapshot), { snapshot: saved.snapshot });
    const old = await c.readGameplayTelemetry(saved.oldSnapshot), missing = await c.readGameplayTelemetry(saved.initialSnapshot);
    let called = 0;
    const replayMeter = c.storageProbe();
    const replay = await c.executeCanonical(saved.last.request, async () => { called++; throw Error('Duplicate effect'); });
    const replayIo = replayMeter.finish();
    return { current: current!, io: io!, keys, bounded: bounded.value, old, missing, replay, replayIo, called, after: await c.audit() };
  }, JSON.stringify(prepared));
  await info.attach('native-ring64.json', { body: JSON.stringify({ prepared, result }, null, 2), contentType: 'application/json' });
  expect(prepared.empty.events).toEqual([]); expect(prepared.empty.sequence).toBe(0);
  expect(result.current.sequence).toBe(70); expect(result.current.events).toHaveLength(64);
  expect(result.current.events.map(e => e.sequence)).toEqual(Array.from({ length: 64 }, (_, i) => i + 7));
  expect(result.current.events.every(e => e.fact.kind === 'reward' && e.fact.targetId === `authored-${e.sequence}`)).toBe(true);
  expect(result.current.snapshot).toEqual(prepared.snapshot); expect(result.bounded).toEqual({ sequence: 70, events: result.current.events });
  expect(result.keys).toHaveLength(65); expect(new Set(result.keys).size).toBe(65);
  expect(result.keys[0]).toBe('execution:telemetry/gameplay/header');
  expect(result.keys.slice(1).every(k => /^execution:telemetry\/gameplay\/slot\/\d+$/.test(k))).toBe(true);
  expect(result.old.events.map(e => e.sequence)).toEqual([1, 2, 3, 4, 5, 6]); expect(result.old.snapshot).toEqual(prepared.oldSnapshot);
  expect(result.missing.events).toEqual([]); expect(result.missing.sequence).toBe(0);
  expect(result.io.operations.every(o => o.method === 'get' && o.status === 'success')).toBe(true);
  expect(result.io.forbidden).toEqual([]);
  expect(result.io.operations.filter(o => o.store === 'records')).toHaveLength(65);
  expect(result.io.operations.some(o => o.store === 'receipts')).toBe(false);
  expect(result.io.transactions.every(t => t.mode === 'readonly' && t.outcome === 'complete')).toBe(true);
  expect(result.current.stats.reads).toBeLessThanOrEqual(2048);
  expect(result.current.stats.readBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(result.current.stats.writes).toBe(0); expect(result.current.stats.writeBytes).toBe(0);
  expect(result.called).toBe(0); expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(prepared.last.result.receipt);
  expect(result.replayIo.operations.map(o => [o.store, o.method])).toEqual([['meta', 'get'], ['receipts', 'get']]);
  expect(result.after).toEqual(prepared.before);
  expect(prepared.last.result.head!.quota.usedBytes).toBe(prepared.before.bytes);
  expect(prepared.before.counts.records).toBeGreaterThan(65); // Fixed readable slots are not physical compaction.
});

test('native canonical capacity refusal rolls staged reward marker, trace, roots, checkpoint, accounting and receipt back together', async ({ page }, info) => {
  const prepared = await page.evaluate(async () => {
    const c = window.nativeTelemetry, { head } = await c.initializeCanonical('telemetry-owner', { walletGold: 0 }, undefined,
      { quota: { limitBytes: 128 * 1024, reserveBytes: 64 * 1024 } });
    const original = await c.append(head, 1), prior = original.result.head!, request = c.command(prior, 2);
    const before = await c.audit(), beforeTrace = await c.readGameplayTelemetry(c.snapshotOf(prior));
    let staged = false, error = '';
    const meter = c.storageProbe();
    try {
      await c.executeCanonical(request, async tx => {
        await tx.pages.set('world', 'fixture/wallet', { gold: 2 });
        await c.recordGameplay(tx, { kind: 'reward', command: 'claim-quest', targetId: 'authored-2',
          walletGoldBefore: 1, walletGoldAfter: 2, lootAwardCount: 0 });
        await tx.pages.set('world', 'fixture/capacity/a', { payload: 'x'.repeat(40 * 1024) });
        await tx.pages.set('world', 'fixture/capacity/b', { payload: 'x'.repeat(40 * 1024) });
        tx.setCheckpoint({ walletGold: 2 }); staged = true;
        return { applied: true, walletGold: 2 };
      });
    } catch (caught) { error = String(caught); }
    const io = meter.finish(), afterHead = (await c.readCanonicalHead()).head;
    const afterTrace = await c.readGameplayTelemetry(c.snapshotOf(afterHead));
    return { prior, request, before, beforeTrace, staged, error, io, afterHead, afterTrace, after: await c.audit() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.nativeTelemetry);
  const reopened = await page.evaluate(async wire => {
    const saved = JSON.parse(wire) as typeof prepared;
    const c = window.nativeTelemetry, head = (await c.readCanonicalHead()).head;
    const records = await c.readCanonical(async pages => ({ wallet: (await pages.get('world', 'fixture/wallet'))?.value,
      a: !!await pages.get('world', 'fixture/capacity/a'), b: !!await pages.get('world', 'fixture/capacity/b') }));
    const missingReceipt = await c.readCanonical(pages => pages.sourceReceipt(saved.request.attemptId)).catch(String);
    const beforeFresh = await c.audit(), committed = await c.append(head, 2, 'after-capacity'), audit = await c.audit();
    return { head, records: records.value, missingReceipt, beforeFresh, committed,
      trace: await c.readGameplayTelemetry(c.snapshotOf(committed.result.head!)), audit };
  }, JSON.stringify(prepared));
  await info.attach('native-capacity-rollback.json', { body: JSON.stringify({ prepared, reopened }, null, 2), contentType: 'application/json' });
  expect(prepared.staged).toBe(true); expect(prepared.error).toContain('storage quota exhausted');
  expect(prepared.io.transactions.some(t => t.mode === 'readwrite' && t.outcome === 'abort')).toBe(true);
  expect(prepared.after).toEqual(prepared.before); expect(prepared.afterHead).toEqual(prepared.prior);
  expect(prepared.prior.quota.usedBytes).toBe(prepared.before.bytes); expect(prepared.afterHead.quota.usedBytes).toBe(prepared.after.bytes);
  expect(prepared.afterTrace).toEqual(prepared.beforeTrace); expect(prepared.afterTrace.sequence).toBe(1);
  expect(reopened.head).toEqual(prepared.prior); expect(reopened.records).toEqual({ wallet: { gold: 1 }, a: false, b: false });
  expect(reopened.beforeFresh).toEqual(prepared.before); expect(reopened.missingReceipt).toContain('missing source receipt');
  expect(reopened.committed.request.attemptId).not.toBe(prepared.request.attemptId); expect(reopened.committed.result.replayed).toBe(false);
  expect(reopened.committed.result.receipt.beforeRevision).toBe(prepared.prior.revision);
  expect(reopened.trace.events.map(e => e.sequence)).toEqual([1, 2]);
  expect(reopened.audit.counts.receipts).toBe(prepared.before.counts.receipts + 1);
  expect(reopened.committed.result.head!.quota.usedBytes).toBe(reopened.audit.bytes);
});

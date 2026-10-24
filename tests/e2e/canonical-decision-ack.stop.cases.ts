import { test, expect, ready, reload } from './canonical-decision-ack.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { HEAD_CAPACITY_BYTES } from '../../src/persistence/canonical/privateCapacity';
import type { auditQuota } from './canonical-decision-ack.storage';

function ordinaryRemaining(audit: Awaited<ReturnType<typeof auditQuota>>) {
  const { head, actualStoredBytes } = audit, q = head.quota, policy = q.privateCapacity;
  if (!policy) throw Error('Expected private capacity');
  expect(q.usedBytes).toBe(actualStoredBytes);
  const charge = actualStoredBytes - Buffer.byteLength(JSON.stringify(['heads', head.gameId, head]))
    + policy.allocatedBytes - policy.consumedBytes + HEAD_CAPACITY_BYTES;
  return q.limitBytes - q.reserveBytes - q.reservedBytes - charge;
}

test('a retained already-stopped claim ACKs without invented settlement usage', async ({ page }) => {
  const { proof } = await ready(page, false);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck; await c.cancel();
    Object.assign(proof.entry, { state: 'cancelled', stopDecision: proof.entry.latestEvent });
    await c.claim(proof); await c.quota(); const ack = await c.ack(proof.entry);
    return { ack, state: await c.state() };
  }, proof);
  expect(r.state.claim!.data).toMatchObject({ stopped: true, settledUsage: null });
  expect(r.ack.request.input).toMatchObject({ proof: { remote: { stopped: true, settledUsage: null } } });
  expect(r.state.terminal!.guard.state).toBe('settled');
});

test('Stop between preparation and funded verification invalidates an unstopped handoff', async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck; await c.prepareAck(proof.entry); await c.cancel(); const before = await c.dump();
    return { error: await c.commitPrepared().then(() => 'accepted', String), unchanged: before === await c.dump(), state: await c.state() };
  }, proof);
  expect(r.error).toContain('Canonical cleanup'); expect(r.unchanged).toBe(true);
  expect(r.state.terminal!.operation.state).toBe('settled');
});

for (const settled of [false, true]) test(`exact Stop before ACK is funded and replayable (settled=${settled})`, async ({ page }, info) => {
  const { seed, proof } = await ready(page, false);
  const r = await page.evaluate(async ({ proof, settled }) => {
    const c = window.canonicalDecisionAck, entry = structuredClone(proof.entry);
    const storagePath = '/tests/e2e/canonical-decision-ack.storage.ts', probePath = '/tests/e2e/storage-probe.ts';
    const storage: typeof import('./canonical-decision-ack.storage') = await import(/* @vite-ignore */ storagePath);
    const { storageProbe }: typeof import('./storage-probe') = await import(/* @vite-ignore */ probePath);
    if (settled) Object.assign(entry, { state: 'blocked', settledUsage: { ...entry.usage, continuations: entry.usage.continuations + 1 } });
    await c.claim({ ...proof, entry }); const stop = await c.cancel(), beforeQuota = await storage.auditQuota();
    const quotaProbe = storageProbe(); let quota, quotaNative;
    try { quota = await c.quota(); } finally { quotaNative = quotaProbe.finish(); }
    const exhausted = await storage.auditQuota(), before = await c.dump();
    const refused = await c.ack(entry).then(() => 'accepted', String), unchanged = before === await c.dump();
    Object.assign(entry, { state: 'cancelled', stopDecision: entry.latestEvent });
    const ackProbe = storageProbe(); let ack, ackNative;
    try { ack = await c.ack(entry); } finally { ackNative = ackProbe.finish(); }
    const after = await c.state(); return { ack, entry, quota, refused, unchanged, after, stop, beforeQuota, exhausted,
      afterQuota: await storage.auditQuota(), quotaNative, ackNative };
  }, { proof, settled });
  await info.attach('quota-stop-ack.json', { body: JSON.stringify(r), contentType: 'application/json' });
  expect(r.quota).toContain('storage quota exhausted'); expect(r.refused).not.toBe('accepted'); expect(r.unchanged).toBe(true);
  expect(ordinaryRemaining(r.exhausted)).toBe(0); expect(ordinaryRemaining(r.afterQuota)).toBeGreaterThan(0);
  expect(r.exhausted.head).toEqual({ ...r.beforeQuota.head, quota: { ...r.beforeQuota.head.quota,
    limitBytes: r.exhausted.head.quota.limitBytes, usedBytes: r.exhausted.actualStoredBytes } });
  expect(r.exhausted.domain).toBe(r.beforeQuota.domain); expect(r.afterQuota.domain).toBe(r.beforeQuota.domain);
  expect(r.exhausted.head.quota.privateCapacity!.allocatedBytes).toBeGreaterThan(0);
  const mutations = (native: typeof r.ackNative) => native.operations.filter(op => ['put', 'add', 'delete', 'clear'].includes(op.method));
  expect(mutations(r.quotaNative).map(op => [op.store, op.method])).toEqual([['heads', 'put']]);
  expect(r.quotaNative.transactions.some(tx => tx.mode === 'readwrite' && tx.outcome === 'abort')).toBe(true);
  expect(mutations(r.ackNative).map(op => op.store).sort()).toEqual(['heads', 'operations', 'receipts']);
  expect(r.ackNative.operations.every(op => op.status === 'success')).toBe(true);
  expect(r.ackNative.transactions.every(tx => tx.outcome === 'complete')).toBe(true);
  expect(r.after.head.quota.reservedBytes).toBe(r.exhausted.head.quota.reservedBytes - r.exhausted.head.allocations[seed.operationId].bytes);
  expect(r.after.head.allocations[seed.launchGuard]).toEqual(r.exhausted.head.allocations[seed.launchGuard]);
  expect(r.after.head.allocations[seed.operationId]).toBeUndefined();
  expect(r.after.terminal!.guard.terminal!.attemptId).toBe(r.stop.request.attemptId);
  expect(r.after.terminal!.guard.state).toBe('settled'); expect(r.after.head.allocations[seed.launchGuard]).toBeDefined();
  expect(r.ack.request.input).toMatchObject({ proof: { remote: { state: 'cancelled', stopped: true } } });
  await reload(page, seed, true);
  const replay = await page.evaluate(async encoded => { const c = window.canonicalDecisionAck, before = await c.dump();
    const storagePath = '/tests/e2e/canonical-decision-ack.storage.ts', probePath = '/tests/e2e/storage-probe.ts';
    const storage: typeof import('./canonical-decision-ack.storage') = await import(/* @vite-ignore */ storagePath);
    const { storageProbe }: typeof import('./storage-probe') = await import(/* @vite-ignore */ probePath);
    const { entry, request } = JSON.parse(encoded) as { entry: AgenticaOperationEntry; request: CanonicalRequest };
    const probe = storageProbe(); let result, native;
    try { result = await c.ack(entry, 'decision-handoff', request); } finally { native = probe.finish(); }
    return { result, native, state: await c.state(), audit: await storage.auditQuota(), unchanged: before === await c.dump() };
  }, JSON.stringify({ entry: r.entry, request: r.ack.request }));
  await info.attach('quota-reload-replay.json', { body: JSON.stringify(replay), contentType: 'application/json' });
  expect(replay.result.receipt).toEqual(r.ack.receipt); expect(replay.unchanged).toBe(true);
  expect(replay.state.terminal!.operation.state).toBe('acknowledged');
  expect(replay.state.terminal).toEqual(r.after.terminal); expect(mutations(replay.native)).toEqual([]);
  expect(ordinaryRemaining(replay.audit)).toBeGreaterThan(0);
  expect(replay.state.head.owner).not.toBe(r.after.head.owner); expect(replay.state.head.status).toBe('ready');
  expect(replay.state.head.roots).toEqual(r.after.head.roots); expect(replay.state.head.checkpoint).toEqual(r.after.head.checkpoint);
  expect(replay.state.head.allocations).toEqual(r.after.head.allocations);
  for (const current of [r.afterQuota, replay.audit]) {
    expect(current.head.quota.limitBytes).toBe(r.exhausted.head.quota.limitBytes);
    expect(current.head.quota.privateCapacity).toEqual(r.exhausted.head.quota.privateCapacity);
    expect(current.domain).toBe(r.beforeQuota.domain);
  }
});

test('ACK before Stop remains valid history and exact retry after owner reload', async ({ page }) => {
  const { seed, proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck, ack = await c.ack(proof.entry); await c.cancel();
    return { ack, state: await c.state() };
  }, proof);
  expect(r.state.terminal!.operation.state).toBe('acknowledged'); expect(r.state.terminal!.guard.state).toBe('settled');
  await reload(page, seed, true);
  const replay = await page.evaluate(async encoded => {
    const { entry, request } = JSON.parse(encoded) as { entry: AgenticaOperationEntry; request: CanonicalRequest };
    const c = window.canonicalDecisionAck, before = await c.dump(), state = await c.state();
    const result = await c.ack(entry, 'decision-handoff', request);
    return { result, state, unchanged: before === await c.dump() };
  }, JSON.stringify({ request: r.ack.request, entry: proof.entry }));
  expect(replay.result.receipt).toEqual(r.ack.receipt); expect(replay.unchanged).toBe(true);
  expect(replay.state.terminal).toEqual(r.state.terminal);
});

for (const store of ['operations', 'receipts', 'heads']) test(`${store} physical ACK failure rolls back and retries the exact funded attempt`, async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async ({ proof, store }) => {
    const c = window.canonicalDecisionAck; await c.quota(); const before = await c.dump();
    const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await c.ack(proof.entry); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const request = c.lastRequest()!, unchanged = before === await c.dump(), result = await c.ack(proof.entry, 'decision-handoff', request);
    const after = await c.dump(), exact = await c.ack(proof.entry, 'decision-handoff', request);
    return { error, request, unchanged, result, exact, exactUnchanged: after === await c.dump(), state: await c.state() };
  }, { proof, store });
  expect(r.error).toContain('Canonical cleanup'); expect(r.unchanged).toBe(true); expect(r.exactUnchanged).toBe(true);
  expect(r.result.request).toEqual(r.request); expect(r.exact.receipt).toEqual(r.result.receipt);
  expect(r.state.terminal!.operation.state).toBe('acknowledged');
});

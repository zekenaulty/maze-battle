import { test, expect, ready, reload } from './canonical-decision-ack.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';

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

for (const settled of [false, true]) test(`exact Stop before ACK is funded and replayable (settled=${settled})`, async ({ page }) => {
  const { seed, proof } = await ready(page, false);
  const r = await page.evaluate(async ({ proof, settled }) => {
    const c = window.canonicalDecisionAck, entry = structuredClone(proof.entry);
    if (settled) Object.assign(entry, { state: 'blocked', settledUsage: { ...entry.usage, continuations: entry.usage.continuations + 1 } });
    await c.claim({ ...proof, entry }); await c.cancel(); const quota = await c.quota(), before = await c.dump();
    const refused = await c.ack(entry).then(() => 'accepted', String), unchanged = before === await c.dump();
    Object.assign(entry, { state: 'cancelled', stopDecision: entry.latestEvent });
    const ack = await c.ack(entry), after = await c.state(); return { ack, entry, quota, refused, unchanged, after };
  }, { proof, settled });
  expect(r.quota).not.toBe('accepted'); expect(r.refused).not.toBe('accepted'); expect(r.unchanged).toBe(true);
  expect(r.after.terminal!.guard.state).toBe('settled'); expect(r.after.head.allocations[seed.launchGuard]).toBeDefined();
  expect(r.ack.request.input).toMatchObject({ proof: { remote: { state: 'cancelled', stopped: true } } });
  await reload(page, seed, true);
  const replay = await page.evaluate(async encoded => { const c = window.canonicalDecisionAck, before = await c.dump();
    const { entry, request } = JSON.parse(encoded) as { entry: AgenticaOperationEntry; request: CanonicalRequest };
    const result = await c.ack(entry, 'decision-handoff', request);
    return { result, state: await c.state(), unchanged: before === await c.dump() }; }, JSON.stringify({ entry: r.entry, request: r.ack.request }));
  expect(replay.result.receipt).toEqual(r.ack.receipt); expect(replay.unchanged).toBe(true);
  expect(replay.state.terminal!.operation.state).toBe('acknowledged');
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

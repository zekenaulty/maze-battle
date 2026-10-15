import { test, expect, ready } from './canonical-decision-ack.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('ACK captures the full service response before its first await', async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck, original = structuredClone(proof.entry);
    await c.prepareAck(proof.entry, true); await c.commitPrepared();
    return { original, mutated: proof.entry, state: await c.state() };
  }, proof);
  expect(r.mutated.wakeRunId).toBe('foreign'); expect(r.state.claim!.data.started.runId).toBe(r.original.wakeRunId);
  expect(r.state.terminal!.operation.state).toBe('acknowledged');
});

for (const field of ['intent', 'claim', 'original', 'event', 'epoch', 'usage', 'stopped', 'settled', 'delivery'])
  test(`historical ACK rejects changed ${field} source without recursive reads or repairs`, async ({ page }) => {
    const { proof } = await ready(page);
    const r = await page.evaluate(async ({ proof, field }) => {
      const c = window.canonicalDecisionAck, ack = await c.ack(proof.entry), request = structuredClone(ack.request);
      const p = (request.input as JsonObject).proof as JsonObject, remote = p.remote as JsonObject;
      if (field === 'intent' || field === 'claim') ((p.decision as JsonObject)[field] as JsonObject).id = 'foreign';
      if (field === 'original') (p.original as JsonObject).id = 'foreign';
      if (field === 'event') (p.event as JsonObject).eventId = 'foreign';
      if (field === 'epoch') remote.activeEpoch = '99';
      if (field === 'usage') (remote.usage as JsonObject).steps = 99;
      if (field === 'stopped') remote.stopped = true;
      if (field === 'settled') remote.settledUsage = remote.usage;
      if (field === 'delivery') p.delivery = 'signal';
      await c.changeSource(request); const before = await c.dump(), error = await c.state().then(() => 'accepted', String);
      return { error, unchanged: before === await c.dump() };
    }, { proof, field });
    expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.unchanged).toBe(true);
  });

for (const kind of ['intent', 'claim'] as const) test(`historical ACK still requires receipted ${kind}`, async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async ({ proof, kind }) => {
    const c = window.canonicalDecisionAck; await c.ack(proof.entry); const state = await c.state();
    await c.corruptRecord(state[kind]!.row, state.head.gameId); const before = await c.dump();
    return { error: await c.state().then(() => 'accepted', String), unchanged: before === await c.dump() };
  }, { proof, kind });
  expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.unchanged).toBe(true);
});

test('funded ACK needs no ordinary execution record or node write at quota', async ({ page }) => {
  const { proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck, quota = await c.quota(), before = await c.state();
    const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function(...args) { if (['records', 'nodes'].includes(this.name)) throw Error('Ordinary write forbidden'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function(...args) { if (['records', 'nodes'].includes(this.name)) throw Error('Ordinary write forbidden'); return put.apply(this, args); };
    try { const ack = await c.ack(proof.entry); return { quota, before, ack, after: await c.state() }; }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
  }, proof);
  expect(r.quota).not.toBe('accepted'); expect(r.after.terminal!.operation.state).toBe('acknowledged');
  expect(r.after.head.roots).toEqual(r.before.head.roots); expect(r.after.terminal!.guard).toEqual(r.before.terminal!.guard);
});

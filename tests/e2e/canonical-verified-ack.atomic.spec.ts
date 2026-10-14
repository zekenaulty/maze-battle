import { expect, test } from './canonical-verified-ack.test';

for (const stage of ['before-call', 'during-read', 'after-read', 'after-head-write'] as const) test(`abort ${stage} leaves no ACK or release`, async ({ page }) => {
  const result = await page.evaluate(async stage => {
    const c = window.verifiedAck, { admission, ack } = await c.settled(), before = await c.dump();
    const controller = new AbortController(); let invoked = false; const put = IDBObjectStore.prototype.put;
    if (stage === 'before-call') controller.abort();
    if (stage === 'after-head-write') IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'heads') request.addEventListener('success', () => controller.abort(), { once: true });
      return request;
    };
    let error: string;
    try {
      error = await c.failure(() => c.acknowledgeCanonical(ack, async view => {
        invoked = true; const read = view.sourceReceipt(admission.attemptId);
        if (stage === 'during-read') controller.abort();
        await read;
        if (stage === 'after-read') controller.abort();
      }, { signal: controller.signal }));
    } finally { IDBObjectStore.prototype.put = put; }
    const after = await c.dump(); const retry = await c.acknowledgeCanonical(ack, async () => {});
    return { error, invoked, before, after, retry };
  }, stage);
  expect(result.error).toContain('AbortError'); expect(result.invoked).toBe(stage !== 'before-call');
  expect(result.after).toEqual(result.before); expect(result.retry.replayed).toBe(false);
});

for (const store of ['operations', 'receipts', 'heads'] as const) test(`physical ${store} write failure rolls back all stores`, async ({ page }) => {
  const result = await page.evaluate(async store => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump();
    const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === store) throw new DOMException('Injected native quota failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === store) throw new DOMException('Injected native quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let error: string;
    try { error = await c.failure(() => c.acknowledgeCanonical(ack, async () => {})); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const after = await c.dump(), retry = await c.acknowledgeCanonical(ack, async () => {});
    return { error, before, after, retry };
  }, store);
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
  expect(result.retry.replayed).toBe(false);
});

test('verifier rejection and exhausted read budget cannot consume acknowledgement funds', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump();
    const rejected = await c.failure(() => c.acknowledgeCanonical(ack, async () => { throw new Error('Remote receipt rejected'); }));
    const exhausted = await c.failure(() => c.acknowledgeCanonical(ack, async view => {
      for (let i = 0; i < 32; i++) await view.liveOperation('verified-operation');
    }, { limits: { reads: 16, writes: 10, bytes: 1024 * 1024 } }));
    return { rejected, exhausted, before, after: await c.dump() };
  });
  expect(result.rejected).toContain('Remote receipt rejected'); expect(result.exhausted).toContain('read budget exhausted');
  expect(result.after).toEqual(result.before);
});

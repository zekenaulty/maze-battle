import { test, expect, arrived, prepare } from './canonical-decision.test';

for (const stage of ['intent', 'claim'] as const) for (const kind of ['record', 'receipt', 'source'] as const)
  test(`${stage} ${kind} corruption fails closed on read without repairing stored history`, async ({ page }) => {
    await arrived(page); await prepare(page);
    if (stage === 'claim') await page.evaluate(async () => { const c = window.canonicalDecision; await c.claim(await c.proof()); });
    const r = await page.evaluate(async ({ stage, kind }) => {
      const c = window.canonicalDecision; await c.corrupt(stage, kind); const before = await c.dump();
      const error = await c.state().then(() => 'accepted', String);
      return { error, unchanged: before === await c.dump() };
    }, { stage, kind });
    expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.unchanged).toBe(true);
  });

for (const stage of ['intent', 'claim'] as const) for (const store of ['records', 'receipts'])
  test(`${stage} ${store} failure rolls back the whole command and retries exactly`, async ({ page }) => {
    await arrived(page);
    if (stage === 'claim') await prepare(page);
    const r = await page.evaluate(async ({ stage, store }) => {
      const c = window.canonicalDecision, publication = stage === 'intent' ? await c.publish() : null,
        proof = stage === 'claim' ? await c.proof() : null;
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await (proof ? c.claim(proof) : c.prepare(publication!)); } catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const operation = stage === 'intent' ? 'agentica.operation.decision' : 'agentica.operation.decision-claim';
      const unchanged = before === await c.dump(), retry = await c.retry(operation);
      const exactBefore = await c.dump(), exact = await c.replay(operation);
      return { error, unchanged, retry, exact, exactUnchanged: exactBefore === await c.dump() };
    }, { stage, store });
    expect(r.error).toContain('QuotaExceededError'); expect(r.unchanged).toBe(true);
    expect(r.retry.replayed).toBe(false); expect(r.exact.replayed).toBe(true);
    expect(r.exact.receipt).toEqual(r.retry.receipt); expect(r.exactUnchanged).toBe(true);
  });

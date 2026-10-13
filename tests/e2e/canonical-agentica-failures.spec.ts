import { expect, test } from './canonical-agentica.test';

for (const kind of ['publication', 'pending', 'admission'] as const) for (const store of kind === 'admission'
  ? ['records', 'nodes', 'operations', 'receipts', 'heads'] : ['records', 'nodes', 'receipts', 'heads']) {
  test(`${kind}: native ${store} failure rolls back all stores; exact original attempt can retry`, async ({ page }) => {
    const r = await page.evaluate(async ({ kind, store }) => {
      const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
      if (kind === 'admission') await c.pending(action, pub.reference, 'writesLocalState');
      const identity = await c.prepareAction(action), current = (await c.readCanonicalHead()).head, afterRevision = current.revision + 1;
      const result = { ...c.protocolResult(action), afterRevision, observation: { ...c.protocolResult(action).observation!, revision: afterRevision },
        operation: { operationId: 'destination', summary: 'Destination admitted.' } };
      const request = c.command(current, kind === 'admission' ? 'operation.admit' : `agentica.${kind}`, kind === 'admission'
        ? { operationId: 'destination', binding: { actionKey: identity.key }, terminalBytes: c.MIN_TERMINAL_BYTES } : {});
      const run = () => kind === 'publication' ? c.executeCanonical(request, async tx => (await c.retainPublication(tx, request)).receipt)
        : kind === 'pending' ? c.executeCanonical(request, async tx => (await c.retainPendingAction(tx, request, identity, pub.reference, 'readOnly')).receipt)
        : c.operateCanonical(request, 'admit', async tx => {
          const stored = await c.retainActionResult(tx, request, identity, result);
          await tx.pages.set('world', 'fixture/effect', { action: action.actionId }); return stored.receipt;
        });
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await run(); } catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await c.dump(), pending = await c.reconcile(action), retried = await run(), committed = await c.dump(), replay = await run();
      return { error, before, after, pending, retried, committed, replay, afterReplay: await c.dump(), retained: await c.reconcile(action) };
    }, { kind, store });
    expect(r.error).toContain('QuotaExceededError'); expect(r.after).toBe(r.before); expect(r.retried.replayed).toBe(false);
    expect(r.replay.replayed).toBe(true); expect(r.afterReplay).toBe(r.committed);
    expect(r.pending.value).toEqual(kind === 'admission' ? { status: 'pending', fingerprint: expect.any(String) } : null);
    if (kind === 'admission') expect(r.retained.value!.status).toBe('completed');
  });
}

test('quota, late deadline, work budget and oversized action failures preserve the original pending action', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference, 'writesLocalState');
    const current = (await c.readCanonicalHead()).head, identity = await c.prepareAction(action), afterRevision = current.revision + 1;
    const result = { ...c.protocolResult(action), afterRevision, observation: { ...c.protocolResult(action).observation!, revision: afterRevision } };
    const request = c.command(current, 'agentica.result'); request.deadlineAt = Date.now() + 60_000;
    const before = await c.dump(), add = IDBObjectStore.prototype.add, now = Date.now;
    IDBObjectStore.prototype.add = function(...args) { const value = add.apply(this, args); if (this.name === 'receipts') Date.now = () => request.deadlineAt! + 1; return value; };
    let deadline = '';
    try { await c.complete(action, result, request, true); } catch (error) { deadline = String(error); }
    finally { IDBObjectStore.prototype.add = add; Date.now = now; }
    const afterDeadline = await c.dump();
    const budget = await c.executeCanonical({ ...request, deadlineAt: null }, async tx => (await c.retainActionResult(tx, request, identity, result)).receipt,
      { limits: { reads: 2, writes: 512, bytes: 4 * 1024 * 1024 } }).catch(String);
    const bound = await c.pending({ ...action, actionId: 'large', arguments: { text: '\\'.repeat(3000) } }, pub.reference).catch(String);
    const afterBounds = await c.dump(), db = await c.openCanonicalDatabase();
    current.quota.limitBytes = current.quota.usedBytes + current.quota.reserveBytes;
    await db.put('heads', current, current.gameId); db.close();
    const beforeQuota = await c.dump(), quota = await c.complete(action, result, { ...request, deadlineAt: null }, true).catch(String);
    return { before, afterDeadline, afterBounds, deadline, budget, bound, beforeQuota, afterQuota: await c.dump(), quota, retained: await c.reconcile(action) };
  });
  expect(r.deadline).toContain('deadline'); expect(r.afterDeadline).toBe(r.before);
  expect(String(r.budget)).toContain('budget'); expect(String(r.bound)).toContain('byte'); expect(r.afterBounds).toBe(r.before);
  expect(String(r.quota)).toContain('quota exhausted'); expect(r.afterQuota).toBe(r.beforeQuota); expect(r.retained.value!.status).toBe('pending');
});

test('escaped source proof exceeding the receipt budget rolls back an otherwise valid action', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish();
    const action = { ...c.protocolAction(head.revision), arguments: { text: '"'.repeat(1500) } };
    const prepared = await c.prepareAction(action), before = await c.dump();
    const error = await c.pending(action, pub.reference).catch(String);
    return { inputBytes: new TextEncoder().encode(JSON.stringify(prepared.action)).length, before, after: await c.dump(), error,
      record: await c.reconcile(action) };
  });
  expect(r.inputBytes).toBeLessThan(4096); expect(String(r.error)).toContain('12288 bytes');
  expect(r.after).toBe(r.before); expect(r.record.value).toBeNull();
});

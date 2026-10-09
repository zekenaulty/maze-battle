import { expect, test } from '@playwright/test';
import type {} from './durable-action-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/durable-action-fixture.html');
  await page.waitForFunction(() => !!window.durable);
});

for (const failure of ['receipt quota', 'session quota', 'abort after receipt']) {
  test(`${failure} rolls checkpoint, effect, result and control back together`, async ({ page }) => {
    const result = await page.evaluate(async failure => {
      const h = window.durable;
      const before = await h.setup();
      const request = h.request();
      const reservation = await h.actions.beginExpeditionAction(h.slot, request);
      const outcome = h.outcome(before, request);
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if ((failure === 'receipt quota' && this.name === 'actionReceipts') ||
          (failure === 'session quota' && this.name === 'actionSessions')) throw new DOMException('Injected quota failure', 'QuotaExceededError');
        const pending = put.call(this, value, key);
        if (failure === 'abort after receipt' && this.name === 'actionReceipts') this.transaction.abort();
        return pending;
      };
      let error = '';
      try { await h.actions.settleExpeditionAction(h.slot, request, outcome); }
      catch (reason) { error = String(reason); }
      finally { IDBObjectStore.prototype.put = put; }
      const after = await h.repository.loadExpedition(h.slot);
      const receipt = await h.actions.loadExpeditionAction(h.slot, request);
      const session = await h.actions.loadExpeditionSession(h.slot);
      const recovered = await h.actions.settleExpeditionAction(h.slot, request, outcome);
      return { before, reservation, error, after, receipt, session, recovered };
    }, failure);
    expect(result.error).toContain(failure === 'abort after receipt' ? 'AbortError' : 'QuotaExceededError');
    expect(result.after).toEqual(result.before);
    expect(result.receipt).toEqual(result.reservation.receipt);
    expect(result.receipt!.effect).toBeUndefined();
    expect(result.session).toMatchObject({ receiptCount: 1, pendingActionId: 'move-1' });
    expect(result.recovered.result).toMatchObject({ disposition: 'applied', afterRevision: 1 });
    expect(result.recovered.effect).toMatchObject({ moves: 1, openedChestIds: [] });
  });
}

test('reservation failure cannot leave an orphan receipt or consume budget', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'actionSessions') throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
    let error = '';
    try { await h.actions.beginExpeditionAction(h.slot, h.request()); } catch (reason) { error = String(reason); }
    finally { IDBObjectStore.prototype.put = put; }
    const missing = await h.actions.loadExpeditionAction(h.slot, h.request());
    const session = await h.actions.loadExpeditionSession(h.slot);
    const retry = await h.actions.beginExpeditionAction(h.slot, h.request());
    return { error, missing, session, retry };
  });
  expect(result.error).toContain('QuotaExceededError');
  expect(result.missing).toBeUndefined();
  expect(result.session).toMatchObject({ receiptCount: 0, pendingActionId: null });
  expect(result.retry.status).toBe('reserved');
});

test('a lost post-commit acknowledgement reconciles without another checkpoint effect', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup();
    const receipt = await h.execute(h.request());
    // The client discards the response after IDB commit, as with a lost transport acknowledgement.
    try { throw new Error('Injected lost acknowledgement'); } catch { return receipt; }
  });
  await page.reload();
  await page.waitForFunction(() => !!window.durable);
  const reconciled = await page.evaluate(async () => {
    const h = window.durable;
    return { receipt: await h.execute(h.request()), saved: await h.repository.loadExpedition(h.slot),
      session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(reconciled.receipt).toEqual(first);
  expect(reconciled.saved!.checkpoint.revision).toBe(1);
  expect(reconciled.session!.receiptCount).toBe(1);
});

test('invalid completions and checkpoint CAS drift preserve the unresolved receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const record = await h.setup();
    const request = h.request();
    await h.actions.beginExpeditionAction(h.slot, request);
    const bad = h.outcome(record, request);
    bad.result.afterRevision = 9;
    const errors = [];
    try { await h.actions.settleExpeditionAction(h.slot, request, bad); } catch (error) { errors.push(String(error)); }
    const unchanged = await h.repository.loadExpedition(h.slot);
    // Simulate a noncooperating writer to exercise the checkpoint CAS, not just the pending-action fence.
    const dbRequest = indexedDB.open('maze-battle-expeditions');
    const db = await new Promise<IDBDatabase>(resolve => { dbRequest.onsuccess = () => resolve(dbRequest.result); });
    const tx = db.transaction('expeditions', 'readwrite');
    tx.objectStore('expeditions').put({ ...record, checkpoint: { ...record.checkpoint, revision: 1 } }, h.slot);
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
    db.close();
    try { await h.actions.settleExpeditionAction(h.slot, request, h.outcome(record, request)); } catch (error) { errors.push(String(error)); }
    return { errors, unchanged, record, pending: await h.actions.loadExpeditionAction(h.slot, request) };
  });
  expect(result.unchanged).toEqual(result.record);
  expect(result.errors).toHaveLength(2);
  expect(result.errors[1]).toContain('checkpoint revision');
  expect(result.pending!.result.disposition).toBe('unresolved');
});

test('ownership and revision refusals create no receipt; slot histories remain isolated', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const record = await h.setup();
    const errors = [];
    for (const patch of [{ epoch: 1 }, { sessionId: 'other' }, { expectedRevision: 1 }]) {
      try { await h.actions.beginExpeditionAction(h.slot, h.request(patch)); } catch (error) { errors.push(String(error)); }
    }
    const missing = await h.actions.loadExpeditionAction(h.slot, h.request());
    await h.repository.saveExpedition('other-slot', record.plan, record.checkpoint, null);
    await h.actions.claimExpeditionSession('other-slot', 'owner-a', null);
    await h.actions.beginExpeditionAction('other-slot', h.request());
    const first = await h.execute(h.request());
    return { errors, missing, first, other: await h.actions.loadExpeditionAction('other-slot', h.request()) };
  });
  expect(result.errors).toHaveLength(3);
  expect(result.missing).toBeUndefined();
  expect(result.first.result.disposition).toBe('applied');
  expect(result.other!.result.disposition).toBe('unresolved');
});

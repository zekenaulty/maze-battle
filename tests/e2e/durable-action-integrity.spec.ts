import { expect, test } from '@playwright/test';
import type {} from './durable-action-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/durable-action-fixture.html');
  await page.waitForFunction(() => !!window.durable);
});

test('caller mutations cannot change an in-flight reservation or committed result', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const record = await h.setup();
    const input = h.request();
    const pending = h.actions.beginExpeditionAction(h.slot, input);
    input.command = { type: 'collect' };
    input.sessionId = 'caller-mutation';
    const reservation = await pending;
    const outcome = h.outcome(record, h.request());
    const expected = structuredClone(outcome);
    const writing = h.actions.settleExpeditionAction(h.slot, h.request(), outcome);
    outcome.checkpoint.moves = 999;
    outcome.result.reason = 'caller-mutation';
    const settled = await writing;
    settled.request.sessionId = 'returned-mutation';
    const reloaded = await h.actions.loadExpeditionAction(h.slot, 'move-1');
    return { reservation, expected, reloaded, saved: await h.repository.loadExpedition(h.slot) };
  });
  expect(result.reservation.receipt.request.sessionId).toBe('owner-a');
  expect(result.reservation.receipt.request.command).toEqual({ type: 'move', direction: 'east' });
  expect(result.reloaded!.result).toEqual(result.expected.result);
  expect(result.reloaded!.request.sessionId).toBe('owner-a');
  expect(result.saved!.checkpoint).toEqual(result.expected.checkpoint);
});

test('corrupt or misplaced receipts fail closed without rewriting the checkpoint', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup();
    const settled = await h.execute(h.request());
    const before = await h.repository.loadExpedition(h.slot);
    const request = indexedDB.open('maze-battle-expeditions');
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('actionReceipts', 'readwrite');
    tx.objectStore('actionReceipts').put({ ...settled, signature: 'corrupt' }, [h.slot, 'move-1']);
    tx.objectStore('actionReceipts').put(settled, [h.slot, 'different-id']);
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
    db.close();
    const errors = [];
    for (const id of ['move-1', 'different-id']) {
      try { await h.actions.loadExpeditionAction(h.slot, id); } catch (error) { errors.push(String(error)); }
    }
    return { before, after: await h.repository.loadExpedition(h.slot), errors };
  });
  expect(result.errors[0]).toContain('signature corrupt');
  expect(result.errors[1]).toContain('receipt key mismatch');
  expect(result.after).toEqual(result.before);
});

test('legacy unmanaged slots retain their save/delete behavior after migration', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const record = h.fixture();
    await h.repository.saveExpedition('legacy', record.plan, record.checkpoint, null);
    const outcome = h.outcome(record, h.request());
    await h.repository.saveExpedition('legacy', record.plan, outcome.checkpoint, 0);
    await h.repository.saveExpedition('legacy', record.plan, outcome.checkpoint, 0);
    const saved = await h.repository.loadExpedition('legacy');
    const session = await h.actions.loadExpeditionSession('legacy');
    await h.repository.deleteExpedition('legacy');
    await h.repository.deleteExpedition('legacy');
    return { saved, session, missing: await h.repository.loadExpedition('legacy') };
  });
  expect(result.saved!.checkpoint.revision).toBe(1);
  expect(result.session).toBeUndefined();
  expect(result.missing).toBeUndefined();
});

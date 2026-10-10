import { expect, test } from '@playwright/test';
import type {} from './durable-action-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/durable-action-fixture.html');
  await page.waitForFunction(() => !!window.durable);
});

test('v1 migration adds stores without rewriting saved records or opening ordinary saves', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const record = { ...h.fixture(), preservedMetadata: { proof: 'v1 bytes' } };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle-expeditions', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('expeditions');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('expeditions', 'readwrite');
    tx.objectStore('expeditions').put(record, h.slot);
    tx.objectStore('expeditions').put(record, 'untouched');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    db.close();
    const loaded = await h.repository.loadExpedition(h.slot);
    await h.actions.claimExpeditionSession(h.slot, 'owner-a', null, 3);
    const request = indexedDB.open('maze-battle-expeditions');
    const migrated = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const stores = Array.from(migrated.objectStoreNames);
    const version = migrated.version;
    migrated.close();
    return { before: JSON.stringify(record), after: JSON.stringify(loaded), untouched: JSON.stringify(await h.repository.loadExpedition('untouched')),
      stores, version, databases: (await indexedDB.databases()).map(db => db.name) };
  });
  expect(result.after).toBe(result.before);
  expect(result.untouched).toBe(result.before);
  expect(result.stores).toEqual(['actionReceipts', 'actionSessions', 'expeditions']);
  expect(result.version).toBe(2);
  expect(result.databases).toEqual(['maze-battle-expeditions']);
});

test('exact retries reconcile the original result and loot state across reload and later actions', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup();
    const first = await h.execute(h.request());
    await h.execute(h.request({ actionId: 'collect', expectedRevision: 1, command: { type: 'collect' } }));
    await h.execute(h.request({ actionId: 'back', expectedRevision: 2, command: { type: 'move', direction: 'west' } }));
    return first;
  });
  await page.reload();
  await page.waitForFunction(() => !!window.durable);
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const original = await h.actions.loadExpeditionAction(h.slot, h.request());
    original!.result.reason = 'caller mutation';
    const replay = await h.execute(h.request());
    const duplicateCommit = await h.actions.settleExpeditionAction(h.slot, h.request(), h.outcome(h.fixture(), h.request()));
    return { replay, duplicateCommit, saved: await h.repository.loadExpedition(h.slot), session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(result.replay).toEqual(first);
  expect(result.duplicateCommit).toEqual(first);
  expect(first.result.observation!.visibleChests[0].opened).toBe(false);
  expect(result.saved!.checkpoint.openedChestIds).toEqual(['chest-a']);
  expect(result.saved!.checkpoint.revision).toBe(3);
  expect(result.session!.receiptCount).toBe(3);
});

test('conflicting reuse rejects every identity component on query, begin and settlement', async ({ page }) => {
  const rejected = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup();
    await h.execute(h.request());
    const variants = [h.request({ sessionId: 'other' }), h.request({ epoch: 1 }), h.request({ expectedRevision: 1 }), h.request({ command: { type: 'collect' } })];
    const errors = [];
    for (const request of variants) {
      for (const operation of [() => h.actions.loadExpeditionAction(h.slot, request), () => h.actions.beginExpeditionAction(h.slot, request),
        () => h.actions.settleExpeditionAction(h.slot, request, h.outcome(h.fixture(), request))]) {
        try { await operation(); } catch (error) { errors.push(String(error)); }
      }
    }
    return errors;
  });
  expect(rejected).toHaveLength(12);
  expect(rejected.every(error => error.includes('reused with different input'))).toBe(true);
});

test('unresolved reservations survive reload; takeover fences stale writers and permits explicit reconciliation', async ({ page }) => {
  await page.evaluate(async () => { await window.durable.setup(); await window.durable.actions.beginExpeditionAction(window.durable.slot, window.durable.request()); });
  await page.reload();
  await page.waitForFunction(() => !!window.durable);
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const previousSession = (await h.actions.loadExpeditionSession(h.slot))!;
    const request = (await h.actions.loadExpeditionAction(h.slot, previousSession.pendingActionId!))!.request;
    const pending = await h.actions.beginExpeditionAction(h.slot, request);
    const owner = await h.actions.claimExpeditionSession(h.slot, 'owner-b', 0);
    const errors = [];
    const outcome = h.outcome(h.fixture(), request);
    for (const operation of [
      () => h.actions.beginExpeditionAction(h.slot, h.request({ actionId: 'other', sessionId: 'owner-b', epoch: 1 })),
      () => h.actions.settleExpeditionAction(h.slot, request, outcome),
      () => h.repository.saveExpedition(h.slot, h.fixture().plan, outcome.checkpoint, 0),
      () => h.repository.deleteExpedition(h.slot),
    ]) { try { await operation(); } catch (error) { errors.push(String(error)); } }
    const settled = await h.actions.settleExpeditionAction(h.slot, request, outcome, owner);
    const replay = await h.actions.beginExpeditionAction(h.slot, request);
    return { pending, owner, errors, settled, replay, session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(result.pending.status).toBe('existing');
  expect(result.pending.receipt.result.disposition).toBe('unresolved');
  expect(result.owner).toMatchObject({ epoch: 1, receiptCount: 1, pendingActionId: 'move-1' });
  expect(result.errors).toHaveLength(4);
  expect(result.errors[0]).toContain('unresolved');
  expect(result.errors[1]).toContain('ownership');
  expect(result.errors[2]).toContain('atomic action commit');
  expect(result.errors[3]).toContain('history must be retained');
  expect(result.settled.result.disposition).toBe('applied');
  expect(result.replay.receipt).toEqual(result.settled);
  expect(result.session!.pendingActionId).toBeNull();
});

test('the bounded ledger retains unresolved and settled receipts; takeover cannot refill it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    await h.setup(2);
    const first = await h.execute(h.request());
    const collect = h.request({ actionId: 'collect', expectedRevision: 1, command: { type: 'collect' } });
    await h.actions.beginExpeditionAction(h.slot, collect);
    const owner = await h.actions.claimExpeditionSession(h.slot, 'owner-b', 0);
    const pending = await h.actions.loadExpeditionAction(h.slot, collect);
    await h.actions.settleExpeditionAction(h.slot, collect, h.outcome((await h.repository.loadExpedition(h.slot))!, collect), owner);
    const errors = [];
    try { await h.actions.beginExpeditionAction(h.slot, h.request({ sessionId: 'owner-b', epoch: 1, actionId: 'third', expectedRevision: 2 })); }
    catch (error) { errors.push(String(error)); }
    try { await h.actions.claimExpeditionSession(h.slot, 'owner-c', 1, 3); } catch (error) { errors.push(String(error)); }
    const nextOwner = await h.actions.claimExpeditionSession(h.slot, 'owner-c', 1);
    return { first, pending, replay: await h.actions.loadExpeditionAction(h.slot, h.request()), errors, nextOwner };
  });
  expect(result.pending!.result.disposition).toBe('unresolved');
  expect(result.errors[0]).toContain('ledger exhausted');
  expect(result.errors[1]).toContain('budget is immutable');
  expect(result.replay).toEqual(result.first);
  expect(result.nextOwner).toMatchObject({ epoch: 2, maxActions: 2, receiptCount: 2 });
});

test('refusals are durable outcomes without checkpoint effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.durable;
    const before = await h.setup();
    const request = h.request({ command: { type: 'collect' } });
    const receipt = await h.execute(request);
    return { receipt, before, after: await h.repository.loadExpedition(h.slot), session: await h.actions.loadExpeditionSession(h.slot) };
  });
  expect(result.receipt.result.disposition).toBe('refused');
  expect(result.receipt.effect).toBeUndefined();
  expect(result.after).toEqual(result.before);
  expect(result.session).toMatchObject({ receiptCount: 1, pendingActionId: null });
});

import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));

test('receipt add failure rolls back state, observations, projections, and world events', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const navigation = await db.executeDirectedRequest('fixture', await db.request('fixture', 'nav', {
      type: 'navigate', operationId: 'op', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' },
    }), 100);
    const request = await db.request('fixture', 'step', { type: 'step', operationId: 'op', sequence: navigation.result.operation!.nextStep });
    const before = await db.auditDirectedSave('fixture');
    const add = IDBObjectStore.prototype.add;
    let error = ''; let receiptAdds = 0;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'receipts') { receiptAdds++; throw new DOMException('Injected quota failure', 'QuotaExceededError'); }
      return add.call(this, value, key);
    };
    try { await db.executeDirectedRequest('fixture', request, 101); } catch (caught) { error = String(caught); }
    finally { IDBObjectStore.prototype.add = add; }
    const after = await db.auditDirectedSave('fixture');
    const missing = await db.reconcileDirectedRequest('fixture', request);
    const retry = await db.executeDirectedRequest('fixture', request, 101);
    return { before, after, missing, retry, error, receiptAdds };
  });
  expect(result.receiptAdds).toBe(1); expect(result.error).toContain('quota failure');
  expect(result.after).toEqual(result.before); expect(result.missing).toBeUndefined(); expect(result.retry.result.status).toBe('applied');
});

test('4096 receipt journal limit fails before any durable effect and preserves exact replay', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    const request = await db.request('fixture', 'original', { type: 'look' });
    const receipt = await db.executeDirectedRequest('fixture', request, 100);
    await db.transaction(async tx => {
      for (let index = 1; index < 4096; index++) {
        const item = structuredClone(receipt); item.request.attemptId = `seed-${index}`;
        await tx.objectStore('receipts').add(item, ['fixture', item.request.attemptId]);
      }
      const record = (await tx.objectStore('saves').get('fixture'))!;
      record.counts.receipts = 4096; await tx.objectStore('saves').put(record, 'fixture');
    });
    const before = await db.readDirectedSave('fixture');
    const fresh = await db.request('fixture', 'overflow', { type: 'look' });
    let error = '';
    try { await db.executeDirectedRequest('fixture', fresh, 101); } catch (caught) { error = String(caught); }
    return { error, before, after: await db.readDirectedSave('fixture'), missing: await db.reconcileDirectedRequest('fixture', fresh),
      replay: await db.executeDirectedRequest('fixture', request, 102), receipt };
  });
  expect(result.error).toContain('receipts journal full'); expect(result.before).toEqual(result.after);
  expect(result.missing).toBeUndefined(); expect(result.replay).toEqual(result.receipt);
});

test('corrupt saves are rejected, never reset or replaced by create', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const db = window.directedStorage;
    const results: string[] = [];
    for (const variant of ['version', 'scope', 'sequence', 'null', 'undefined']) {
      await db.setup(variant);
      await db.transaction(async tx => {
        const record = (await tx.objectStore('saves').get(variant))!;
        if (variant === 'version') (record.session as { version: string }).version = 'future-version';
        if (variant === 'scope') record.session.knowledge.observerId = 'wrong-observer';
        if (variant === 'sequence') record.session.knowledge.revision++;
        const corrupt = variant === 'null' ? null : variant === 'undefined' ? undefined : record;
        await tx.objectStore('saves').put(corrupt as unknown as typeof record, variant);
      });
      try { await db.createDirectedSave(variant); results.push('unexpected success'); } catch (caught) { results.push(String(caught)); }
    }
    return results;
  });
  expect(errors).toHaveLength(5); expect(errors.every(value => value.startsWith('Error: Directed storage:'))).toBe(true);
});

test('historical projection corruption is rejected by independent audit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = window.directedStorage; await db.setup();
    await db.transaction(async tx => {
      const old = (await tx.objectStore('projections').get(['fixture', 1]))!;
      old.observerId = 'other-observer'; await tx.objectStore('projections').put(old, ['fixture', 1]);
    });
    try { await db.auditDirectedSave('fixture'); return 'unexpected success'; } catch (caught) { return String(caught); }
  });
  expect(result).toContain('historical projection differs from sources');
});

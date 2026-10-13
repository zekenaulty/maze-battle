import { expect, test } from './canonical-manual-saves.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

for (const kind of ['create', 'load', 'delete']) for (const store of kind === 'load' ? ['receipts', 'heads'] : ['records', 'nodes', 'receipts', 'heads']) {
  test(`${kind}: native ${store} failure atomically rolls back all stores`, async ({ page }) => {
    const result = await page.evaluate(async ({ kind, store }) => {
      const c = window.manualSaves; await c.seed(); const save = await c.create(); await c.change();
      const request = c.command((await c.readCanonicalHead()).head, 'save.command', kind === 'create' ? { kind, label: 'Second' } : { kind, id: save.id });
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await c.executeSaveCommand(request); } catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await c.dump(), retry = await c.executeSaveCommand(request);
      return { error, before, after, retry };
    }, { kind, store });
    expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
    expect(result.retry.replayed).toBe(false);
  });
}

for (const kind of ['create', 'load', 'delete']) test(`${kind}: exhausted quota and late deadline leave no partial commit`, async ({ page }) => {
  const result = await page.evaluate(async kind => {
    const c = window.manualSaves; await c.seed(); const save = await c.create(); await c.change();
    const request: CanonicalRequest = c.command((await c.readCanonicalHead()).head, 'save.command', kind === 'create' ? { kind, label: 'Second' } : { kind, id: save.id });
    request.deadlineAt = Date.now() + 60_000;
    const before = await c.dump(), add = IDBObjectStore.prototype.add, now = Date.now;
    IDBObjectStore.prototype.add = function(...args) {
      const result = add.apply(this, args);
      if (this.name === 'receipts') Date.now = () => request.deadlineAt! + 1;
      return result;
    };
    let expired = '';
    try { await c.executeSaveCommand(request); } catch (cause) { expired = String(cause); }
    finally { IDBObjectStore.prototype.add = add; Date.now = now; }
    const afterDeadline = await c.dump(), db = await c.openCanonicalDatabase(), head = (await c.readCanonicalHead()).head;
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes;
    await db.put('heads', head, head.gameId); db.close();
    const quotaBefore = await c.dump(), quotaError = await c.executeSaveCommand({ ...request, deadlineAt: null }).catch(String);
    return { expired, before, afterDeadline, quotaBefore, quotaAfter: await c.dump(), quotaError };
  }, kind);
  expect(result.expired).toContain('deadline'); expect(result.afterDeadline).toEqual(result.before);
  expect(result.quotaError).toContain('quota exhausted'); expect(result.quotaAfter).toEqual(result.quotaBefore);
});

test('competing saves on the same fence commit exactly once', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, head = await c.seed();
    const first = c.command(head, 'save.command', { kind: 'create', label: 'First' });
    const second = c.command(head, 'save.command', { kind: 'create', label: 'Second' });
    const outcomes = await Promise.allSettled([c.executeSaveCommand(first), c.executeSaveCommand(second)]);
    return { states: outcomes.map(x => x.status), saves: await c.listManualSaves(), dump: await c.dump(), head: (await c.readCanonicalHead()).head };
  });
  expect(result.states.sort()).toEqual(['fulfilled', 'rejected']); expect(result.saves).toHaveLength(1);
  expect(result.head.quota.usedBytes).toBe(result.dump.bytes);
});

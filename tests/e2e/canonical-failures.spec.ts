import { expect, test } from './canonical-test';

for (const failedStore of ['records', 'nodes', 'receipts', 'heads']) test(`native ${failedStore} write failure rolls back effects and receipt`, async ({ page }) => {
  const result = await page.evaluate(async failedStore => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', { count: 0 });
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function (...args) { if (this.name === failedStore) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function (...args) { if (this.name === failedStore) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try {
      await c.executeCanonical(c.command(head), async tx => {
        await tx.pages.set('world', 'chest', { open: true }); await tx.pages.set('knowledge', 'evidence', { observed: true });
        tx.setCheckpoint({ count: 1 }); return { done: true };
      });
    } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    return { error, before, after: await c.dump() };
  }, failedStore);
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
});

for (const failedStore of ['meta', 'records', 'nodes', 'heads']) test(`reset abort restores the previous game after ${failedStore} failure`, async ({ page }) => {
  const result = await page.evaluate(async failedStore => {
    const c = window.canonical;
    await c.initializeCanonical('owner', { old: true }, async pages => { await pages.set('world', 'old', 1); });
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function (...args) { if (this.name === failedStore) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function (...args) { if (this.name === failedStore) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await c.resetCanonical('new', { fresh: true }, async pages => { await pages.set('world', 'new', 1); }); }
    catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    return { error, before, after: await c.dump() };
  }, failedStore);
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
});

test('caught index collision poisons the entire record transaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}, async pages => {
      await pages.set('world', 'a', 'original-a', ['by/old-a']); await pages.set('world', 'b', 'original-b', ['by/b']);
    });
    const before = await c.dump(); let caught = '';
    const error = await c.executeCanonical(c.command(head), async tx => {
      try { await tx.pages.set('world', 'a', 'changed', ['by/new-a', 'by/b']); } catch (cause) { caught = String(cause); }
      return { swallowed: true };
    }).catch(String);
    return { error, caught, before, after: await c.dump(), rows: (await c.listCanonical('world', 'by/')).value.rows };
  });
  expect(result.caught).toContain('already assigned'); expect(result.error).toContain('not usable');
  expect(result.after).toEqual(result.before); expect(result.rows.map(r => r.value).sort()).toEqual(['original-a', 'original-b']);
});

for (const failure of ['expired', 'late-deadline', 'cancelled', 'late-cancel', 'budget']) test(`${failure} never publishes partial work`, async ({ page }) => {
  const result = await page.evaluate(async failure => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), before = await c.dump();
    const request = c.command(head), signal = new AbortController(), now = Date.now, add = IDBObjectStore.prototype.add;
    request.deadlineAt = Date.now() + 60_000;
    if (failure === 'expired') request.deadlineAt = Date.now() - 1;
    if (failure === 'cancelled') signal.abort();
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'receipts' && failure === 'late-deadline') Date.now = () => request.deadlineAt! + 1;
      if (this.name === 'receipts' && failure === 'late-cancel') signal.abort();
      return add.apply(this, args);
    };
    let error = '';
    try {
      await c.executeCanonical(request, async tx => { await tx.pages.set('world', 'a', 1); return 1; }, {
        signal: signal.signal, ...(failure === 'budget' ? { limits: { reads: 2, writes: 1, bytes: 4096 } } : {}),
      });
    } catch (cause) { error = String(cause); }
    finally { Date.now = now; IDBObjectStore.prototype.add = add; }
    return { error, before, after: await c.dump() };
  }, failure);
  expect(result.error).toMatch(/deadline|cancel|budget|abort|not active/i); expect(result.after).toEqual(result.before);
});

for (const corruption of ['missing-record', 'future-record', 'foreign-record', 'missing-node']) test(`${corruption} fails closed instead of regenerating`, async ({ page }) => {
  const result = await page.evaluate(async corruption => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}, async pages => { await pages.set('world', 'a', 1); });
    const db = await c.openCanonicalDatabase();
    if (corruption === 'missing-node') await db.delete('nodes', [head.gameId, head.roots.world!]);
    else {
      const row = (await db.getAll('records'))[0];
      if (corruption === 'missing-record') await db.delete('records', [head.gameId, row.id]);
      if (corruption === 'future-record') await db.put('records', { ...row, revision: head.revision + 1 }, [head.gameId, row.id]);
      if (corruption === 'foreign-record') await db.put('records', { ...row, generation: 'foreign' }, [head.gameId, row.id]);
    }
    db.close(); const before = await c.dump();
    const error = await c.readCanonical(pages => pages.get('world', 'a')).catch(String);
    return { error, before, after: await c.dump() };
  }, corruption);
  expect(result.error).toMatch(/missing|future|foreign/); expect(result.after).toEqual(result.before);
});

test('blocked upgrade fails visibly and an abandoned request cannot wipe data later', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const old = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('maze-battle', 7);
      r.onupgradeneeded = () => r.result.createObjectStore('sentinel'); r.onsuccess = () => resolve(r.result); });
    const error = await window.canonical.openCanonicalDatabase().then(db => { db.close(); return 'unexpected success'; }, String);
    old.close();
    const reopened = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('maze-battle', 7);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const stores = [...reopened.objectStoreNames]; reopened.close();
    return { error, stores };
  });
  expect(result.error).toContain('blocked'); expect(result.stores).toEqual(['sentinel']);
});

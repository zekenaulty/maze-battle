import { test, expect } from '@playwright/test';

test('native probe counts UTF-8 payloads, rejects unmetered cursor/index access and restores hooks', async ({ page }) => {
  await page.route('**/probe-setup', route => route.fulfill({ contentType: 'text/html', body: '<title>Probe test</title>' }));
  await page.goto('/probe-setup');
  const result = await page.evaluate(async () => {
    const { startProbe, finishProbe } = await import('../../tests/e2e/canonical-revisit.probe.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle', 9);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('records', { keyPath: 'id' }); store.createIndex('key', 'key');
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    const originals = { cursor: IDBObjectStore.prototype.openCursor, index: IDBIndex.prototype.get,
      get: IDBObjectStore.prototype.get, transaction: IDBDatabase.prototype.transaction };
    const value = { id: 'one', key: 'proof', text: '\u754c'.repeat(8) };
    await startProbe();
    const write = db.transaction('records', 'readwrite'); write.objectStore('records').put(value); await done(write);
    const read = db.transaction('records', 'readonly'), store = read.objectStore('records');
    store.get('one');
    const refused = [];
    for (const call of [() => store.getKey('one'), () => store.openCursor(), () => store.openKeyCursor(), () => store.index('key').get('proof'),
      () => store.index('key').openCursor()]) {
      try { call(); } catch (error) { refused.push(String(error)); }
    }
    await done(read);
    const sample = await finishProbe();
    const restored = originals.cursor === IDBObjectStore.prototype.openCursor
      && originals.index === IDBIndex.prototype.get && originals.get === IDBObjectStore.prototype.get
      && originals.transaction === IDBDatabase.prototype.transaction;
    const verify = db.transaction('records', 'readonly');
    const request = verify.objectStore('records').index('key').get('proof');
    const found = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await done(verify); db.close();
    return { sample, restored, refused, found, value, bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength };
  });
  expect(result.restored).toBe(true); expect(result.refused).toHaveLength(5);
  expect(result.sample.forbidden).toEqual(['store.getKey', 'store.openCursor', 'store.openKeyCursor', 'index.get', 'index.openCursor']);
  expect(result.found).toEqual(result.value);
  expect(result.sample.readKeys).toEqual(['proof']); expect(result.sample.writeKeys).toEqual(['proof']);
  expect(result.sample.reads).toBe(1); expect(result.sample.writes).toBe(1);
  expect(result.sample.readBytes).toBe(result.bytes); expect(result.sample.writeBytes).toBe(result.bytes);
  expect(result.sample.native.operations.every(o => o.status === 'success')).toBe(true);
  expect(result.sample.native.transactions.map(t => t.outcome)).toEqual(['complete', 'complete']);
});

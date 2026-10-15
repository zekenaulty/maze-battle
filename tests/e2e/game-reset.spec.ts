import { expect, test } from '@playwright/test';
import { discardedMarker, retiredSchemas, seedRetiredSchema } from './game-reset-fixtures';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/reset-fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Disposable reset fixture</title>' }));
  await page.goto('/reset-fixture');
});

for (const fixture of retiredSchemas) test(`discards schema ${fixture.version} / ${fixture.envelope} without reading or migrating it`, async ({ page }) => {
  await page.evaluate(seedRetiredSchema, fixture);
  const result = await page.evaluate(async () => {
    const unrelated = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('unrelated-app', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('data');
      open.onerror = () => reject(open.error); open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = unrelated.transaction('data', 'readwrite'); tx.objectStore('data').put('keep', 'sentinel');
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    const forbiddenReads: string[] = [];
    const methods = ['get', 'getAll', 'getKey', 'getAllKeys', 'count', 'openCursor', 'openKeyCursor'] as const;
    const restorers = methods.map(method => {
      const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, method)!;
      Object.defineProperty(IDBObjectStore.prototype, method, { ...descriptor, value: function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.transaction.db.name === 'maze-battle'
          && (this.transaction.db.version < 9 || this.transaction.mode === 'versionchange')) {
          forbiddenReads.push(this.name + '.' + method); throw Error('Old-schema read during reset');
        }
        return descriptor.value.apply(this, args);
      } });
      return () => Object.defineProperty(IDBObjectStore.prototype, method, descriptor);
    });
    try {
      const lifecyclePath = '/src/persistence/canonical/lifecycle.ts', databasePath = '/src/persistence/canonical/database.ts';
      const { initializeCanonical } = await import(/* @vite-ignore */ lifecyclePath) as typeof import('../../src/persistence/canonical/lifecycle');
      const { openCanonicalDatabase } = await import(/* @vite-ignore */ databasePath) as typeof import('../../src/persistence/canonical/database');
      const fresh = await initializeCanonical('fresh-owner', { fresh: true });
      const db = await openCanonicalDatabase();
      const names = [...db.objectStoreNames], version = db.version;
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(async name => [name, await tx.objectStore(name).getAll()]));
      await tx.done; db.close();
      const sentinel = await new Promise(resolve => {
        const read = unrelated.transaction('data').objectStore('data').get('sentinel');
        read.onsuccess = () => resolve(read.result);
      });
      return { fresh: fresh.head, names, version, rows: JSON.stringify(rows), forbiddenReads, sentinel };
    } finally { restorers.forEach(restore => restore()); unrelated.close(); }
  });
  expect(result.version).toBe(9);
  expect(result.names).toEqual(['heads', 'meta', 'nodes', 'operations', 'receipts', 'records']);
  expect(result.rows).not.toContain(discardedMarker);
  expect(result.fresh).toMatchObject({ owner: 'fresh-owner', revision: 1, checkpoint: { fresh: true },
    roots: { world: null, knowledge: null, execution: null } });
  expect(result.fresh.gameId).not.toBe(discardedMarker);
  expect(result.forbiddenReads).toEqual([]);
  expect(result.sentinel).toBe('keep');
});

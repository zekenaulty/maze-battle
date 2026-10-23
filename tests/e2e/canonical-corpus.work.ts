import type { Page } from '@playwright/test';
import type { CanonicalHead } from '../../src/persistence/canonical/types';
import type {} from './canonical-corpus.fixture';

/** Independent fault oracle; never exposed to a controller or used to select a route. */
export function quotaBoundary(head: CanonicalHead) {
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  let limit = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
  for (let i = 0; i < 16; i++) {
    const next = structuredClone(head); next.quota.limitBytes = limit;
    next.quota.usedBytes += bytes(next) - bytes(head);
    const required = next.quota.usedBytes + next.quota.reserveBytes + next.quota.reservedBytes;
    if (required === limit) return limit;
    limit = required;
  }
  throw Error('Quota oracle failed to converge');
}

export async function injectQuota(page: Page, limitBytes: number) {
  return page.evaluate(async limitBytes => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('heads', 'readwrite'), store = tx.objectStore('heads');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
      });
      const rows = await new Promise<CanonicalHead[]>((resolve, reject) => {
        const request = store.getAll(); request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (rows.length !== 1) throw Error('Expected one isolated corpus head');
      const before = rows[0], after = structuredClone(before);
      const bytes = (head: CanonicalHead) => new TextEncoder().encode(JSON.stringify(['heads', head.gameId, head])).byteLength;
      after.quota.limitBytes = limitBytes;
      for (let i = 0; i < 16; i++) {
        const used = before.quota.usedBytes + bytes(after) - bytes(before);
        if (used === after.quota.usedBytes) break;
        after.quota.usedBytes = used;
      }
      if (after.quota.usedBytes !== before.quota.usedBytes + bytes(after) - bytes(before)
        || after.quota.usedBytes + after.quota.reservedBytes > limitBytes - after.quota.reserveBytes)
        throw Error('Fault must leave a valid, non-exhausted pre-action quota');
      store.put(after, after.gameId); await done;
      return { before, after };
    } finally { db.close(); }
  }, limitBytes);
}

export async function measuredMove(page: Page, completeSnapshot = false) {
  return page.evaluate(async completeSnapshot => {
    const snapshot = async () => {
      if (!completeSnapshot) return null;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('maze-battle');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly');
        const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const rows: { store: string; keys: IDBValidKey[]; values: unknown[] }[] = [];
        for (const name of names) {
          const store = tx.objectStore(name);
          rows.push({ store: name, keys: await read(store.getAllKeys()), values: await read(store.getAll()) });
        }
        return rows;
      } finally { db.close(); }
    };
    const before = await window.canonicalCorpus.audit();
    const databaseBefore = await snapshot();
    let receipts: Awaited<ReturnType<typeof window.canonicalCorpus.move>> = [], error: string | null = null;
    try { receipts = await window.canonicalCorpus.move('east'); }
    catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    return { before, after: await window.canonicalCorpus.audit(), receipts, error,
      databaseBefore, databaseAfter: await snapshot(), status: window.canonicalCorpus.status(),
      identities: window.corpusControl!.allocations() };
  }, completeSnapshot);
}

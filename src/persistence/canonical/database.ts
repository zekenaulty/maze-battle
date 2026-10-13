import { openDB, type IDBPDatabase } from 'idb';
import { CANONICAL_STORES, type CanonicalDb } from './types';

export const CANONICAL_DATABASE = 'maze-battle';
export const CANONICAL_VERSION = 9;

/** Cutover opener: old Maze Battle schemas are discarded, never read or converted. */
export function openCanonicalDatabase(signal?: AbortSignal): Promise<IDBPDatabase<CanonicalDb>> {
  return new Promise((resolve, reject) => {
    let abandoned = false, cancelUpgrade: (() => void) | undefined;
    const fail = (error: unknown) => {
      abandoned = true;
      try { cancelUpgrade?.(); } catch { /* Upgrade already settled. */ }
      signal?.removeEventListener('abort', cancel); reject(error);
    };
    const cancel = () => fail(new DOMException('Canonical open cancelled', 'AbortError'));
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    const pending = openDB<CanonicalDb>(CANONICAL_DATABASE, CANONICAL_VERSION, {
      upgrade(db, _oldVersion, _newVersion, tx) {
        cancelUpgrade = () => tx.abort();
        void tx.done.catch(() => {});
        // A previously blocked/cancelled open must never upgrade later in the background.
        if (abandoned) { tx.abort(); return; }
        for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
        for (const name of CANONICAL_STORES) db.createObjectStore(name);
        void tx.objectStore('meta').put({ schema: 1, generation: crypto.randomUUID(), gameId: null }, 'schema').catch(fail);
      },
      blocked() { fail(new Error('Canonical storage blocked. Close other Maze Battle tabs and retry.')); },
      blocking() { void pending.then(db => db.close(), () => {}); },
    });
    void pending.then(db => {
      signal?.removeEventListener('abort', cancel);
      if (abandoned) db.close(); else resolve(db);
    }, fail);
  });
}

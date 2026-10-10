import { openDB } from 'idb';
import type { DirectedRequest } from '../../src/domain/directed/operationTypes';
import { DIRECTED_DATABASE } from '../../src/persistence/directed/database';
import { executeDirectedRequest } from '../../src/persistence/directed/repository';

export async function rawDirectedDatabase() {
  const db = await openDB(DIRECTED_DATABASE);
  try {
    const tx = db.transaction(Array.from(db.objectStoreNames));
    const stores: Record<string, { keys: IDBValidKey[]; values: unknown[] }> = {};
    for (const name of tx.objectStoreNames) {
      stores[name] = { keys: await tx.objectStore(name).getAllKeys(), values: await tx.objectStore(name).getAll() };
    }
    await tx.done;
    return stores;
  } finally { db.close(); }
}

/** A native write lock, held by IDB requests rather than timers or mocked storage. */
export async function executeBehindDirectedLock(slot: string, request: DirectedRequest,
  queuedAt: number, releasedAt: number, useDefaultClock: boolean) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DIRECTED_DATABASE);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  const lock = db.transaction('saves', 'readwrite');
  const done = new Promise<void>((resolve, reject) => {
    lock.oncomplete = () => resolve();
    lock.onabort = () => reject(lock.error);
  });
  void done.catch(() => {});
  const getAll = IDBObjectStore.prototype.getAll, wallClock = Date.now;
  let time = queuedAt, samples = 0, samplesBeforeRelease = -1, queued = false, holding = true;
  const clock = () => { samples++; return time; };
  IDBObjectStore.prototype.getAll = function(query, count) {
    if (this.transaction.db.name === DIRECTED_DATABASE && this.name === 'saves' && this.transaction !== lock) queued = true;
    return getAll.call(this, query, count);
  };
  if (useDefaultClock) Date.now = clock;
  const keepAlive = () => {
    const read = lock.objectStore('saves').get(slot);
    read.onsuccess = () => {
      if (!holding) return;
      if (queued) {
        samplesBeforeRelease = samples;
        time = releasedAt;
        holding = false;
      } else keepAlive();
    };
  };
  keepAlive();
  try {
    const receipt = useDefaultClock ? await executeDirectedRequest(slot, request)
      : await executeDirectedRequest(slot, request, clock);
    await done;
    return { receipt, queued, samplesBeforeRelease, samples };
  } finally {
    holding = false;
    IDBObjectStore.prototype.getAll = getAll;
    Date.now = wallClock;
    try { lock.abort(); } catch { /* The released lock already committed. */ }
    await done.catch(() => {});
    db.close();
  }
}

import { listAgenticaRecovery } from '../../src/persistence/canonical/agentica/recovery';
import { CANONICAL_DATABASE, CANONICAL_VERSION } from '../../src/persistence/canonical/database';
import { readCanonicalHead } from '../../src/persistence/canonical/read';

export async function unchangedSchema(legacy: boolean) {
  if (legacy) await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(CANONICAL_DATABASE, CANONICAL_VERSION - 1);
    open.onupgradeneeded = () => open.result.createObjectStore('sentinel').put('preserve', 'original');
    open.onsuccess = () => { open.result.close(); resolve(); }; open.onerror = () => reject(open.error);
  });
  const before = await indexedDB.databases(), writes: string[] = [];
  const methods = ['put', 'add', 'delete', 'clear'] as const;
  const originals = methods.map(name => Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, name)!);
  for (const name of methods) IDBObjectStore.prototype[name] = function () { writes.push(name); throw Error('Discovery wrote an object store'); };
  let error: string | undefined;
  try { await listAgenticaRecovery(); } catch (cause) { error = String(cause); }
  finally { methods.forEach((name, i) => Object.defineProperty(IDBObjectStore.prototype, name, originals[i])); }
  const after = await indexedDB.databases();
  const sentinel = legacy ? await new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open(CANONICAL_DATABASE, CANONICAL_VERSION - 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const get = open.result.transaction('sentinel', 'readonly').objectStore('sentinel').get('original');
      get.onsuccess = () => { open.result.close(); resolve(get.result); }; get.onerror = () => reject(get.error);
    };
  }) : null;
  return { before, after, writes, error, sentinel };
}

/** Insert a competing head write precisely between discovery's two readonly transactions. */
export async function inventoryRace() {
  const { head } = await readCanonicalHead(), transaction = IDBDatabase.prototype.transaction;
  let injected = false, completed!: Promise<void>;
  IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
    const tx = transaction.apply(this, args);
    if (!injected && (args[1] ?? 'readonly') === 'readonly') {
      injected = true;
      completed = new Promise<void>((resolve, reject) => tx.addEventListener('complete', () => {
        const writer = transaction.call(this, ['heads'], 'readwrite');
        writer.objectStore('heads').put({ ...head, revision: head.revision + 1 }, head.gameId);
        writer.oncomplete = () => resolve(); writer.onabort = () => reject(writer.error);
      }, { once: true }));
    }
    return tx;
  };
  let error: string | undefined;
  try { await listAgenticaRecovery(); } catch (cause) { error = String(cause); }
  finally { IDBDatabase.prototype.transaction = transaction; }
  await completed; return { injected, error };
}

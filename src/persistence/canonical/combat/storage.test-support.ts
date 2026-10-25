import { vi } from 'vitest';
import * as database from '../database';

type Tables = Map<string, Map<string, any>>;
const keyOf = (key: unknown) => JSON.stringify(key);

/** Kernel transaction/receipt logic is real; IDB scheduling/durability is NOT modeled. */
export function memoryStorage(initial?: Tables) {
  let tables = initial ? structuredClone(initial) : new Map(['meta', 'heads', 'records', 'nodes', 'receipts', 'operations'].map(s => [s, new Map()]));
  let fail: string | undefined;
  const get = (store: string, key: unknown) => structuredClone(tables.get(store)!.get(keyOf(key)));
  const put = (store: string, key: unknown, value: unknown) => tables.get(store)!.set(keyOf(key), structuredClone(value));
  function transaction(mode: 'readonly' | 'readwrite' = 'readwrite') {
    const staged = structuredClone(tables); let aborted = false;
    const done = {
      then(resolve: (value?: unknown) => unknown, reject: (error: Error) => unknown) {
        if (aborted) return Promise.reject(new Error('Memory transaction aborted')).then(resolve, reject);
        if (mode === 'readwrite') tables = staged;
        return Promise.resolve().then(resolve, reject);
      },
      catch() { return Promise.resolve(); },
    };
    return { mode, done, abort() { aborted = true; }, objectStore(store: string) {
      const rows = staged.get(store)!;
      const write = async (value: unknown, key: unknown, add: boolean) => {
        if (fail === store) { fail = undefined; throw Error(`Injected ${store} failure`); }
        if (add && rows.has(keyOf(key))) throw Error('Duplicate memory storage key');
        rows.set(keyOf(key), structuredClone(value)); return key;
      };
      return { get: async (key: unknown) => structuredClone(rows.get(keyOf(key))),
        add: (value: unknown, key: unknown) => write(value, key, true), put: (value: unknown, key: unknown) => write(value, key, false) };
    } };
  }
  const db = { transaction: (_stores: unknown, mode: 'readonly' | 'readwrite') => transaction(mode), close() {} };
  const install = () => vi.spyOn(database, 'openCanonicalDatabase').mockResolvedValue(db as unknown as Awaited<ReturnType<typeof database.openCanonicalDatabase>>);
  return { get, put, transaction, install, snapshot: () => structuredClone(tables), failOnce: (store: string) => { fail = store; } };
}

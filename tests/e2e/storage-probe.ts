export interface StorageOperation {
  database: string; store: string; method: string; status: 'pending' | 'success' | 'error';
  records: number; logicalBytes: number; callMs: number; requestMs: number;
}

/** Test-only native request instrumentation. JSON byte counts are NOT physical disk I/O. */
export function storageProbe() {
  const operations: StorageOperation[] = [], restore: (() => void)[] = [];
  const transactions: { mode: IDBTransactionMode; stores: string[]; outcome: string; elapsedMs: number }[] = [];
  let meteringMs = 0;
  const measure = (entry: StorageOperation, value: unknown, many = false) => {
    const started = performance.now();
    entry.records = value === undefined ? 0 : many ? (value as unknown[]).length : 1;
    entry.logicalBytes = value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).byteLength;
    meteringMs += performance.now() - started;
  };
  for (const method of ['get', 'getAll', 'put', 'add', 'delete', 'clear', 'getAllKeys', 'count'] as const) {
    const original = IDBObjectStore.prototype[method];
    const replacement = function(this: IDBObjectStore, ...args: unknown[]) {
      const started = performance.now();
      const request = Reflect.apply(original, this, args) as IDBRequest;
      if (this.transaction.db.name !== 'maze-battle') return request;
      const entry: StorageOperation = { database: this.transaction.db.name, store: this.name, method,
        status: 'pending', records: 0, logicalBytes: 0, callMs: performance.now() - started, requestMs: 0 };
      operations.push(entry);
      if (method === 'put' || method === 'add') measure(entry, args[0]);
      request.addEventListener('success', () => {
        entry.status = 'success'; entry.requestMs = performance.now() - started;
        if (method === 'get' || method === 'getAll' || method === 'getAllKeys') measure(entry, request.result, method !== 'get');
      }, { once: true });
      request.addEventListener('error', () => { entry.status = 'error'; entry.requestMs = performance.now() - started; }, { once: true });
      return request;
    };
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: replacement });
    restore.push(() => Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: original }));
  }
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(...args: Parameters<typeof originalTransaction>) {
    const tx = Reflect.apply(originalTransaction, this, args) as IDBTransaction;
    if (this.name !== 'maze-battle') return tx;
    const started = performance.now(), entry = { mode: tx.mode, stores: [...tx.objectStoreNames], outcome: 'pending', elapsedMs: 0 };
    transactions.push(entry);
    for (const event of ['complete', 'abort']) tx.addEventListener(event, () => {
      entry.outcome = event; entry.elapsedMs = performance.now() - started;
    }, { once: true });
    return tx;
  };
  restore.push(() => { IDBDatabase.prototype.transaction = originalTransaction; });
  return { finish() {
    for (const reset of restore.reverse()) reset();
    return { operations, transactions, meteringMs };
  } };
}

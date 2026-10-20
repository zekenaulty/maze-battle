import { storageProbe } from './storage-probe';

let active: { meter: ReturnType<typeof storageProbe>; restore: (() => void)[];
  readKeys: string[]; writeKeys: string[]; started: number; usage?: number; forbidden: string[] } | undefined;

/** Each page installs its own hooks. Enumeration guards make unmetered access fail explicitly. */
export async function startProbe() {
  if (active) throw Error('Revisit probe already running');
  const usage = (await navigator.storage.estimate()).usage;
  const restore: (() => void)[] = [], readKeys: string[] = [], writeKeys: string[] = [], forbidden: string[] = [];
  for (const [prototype, methods] of [
    [IDBObjectStore.prototype, ['getKey', 'getAllRecords', 'openCursor', 'openKeyCursor']],
    [IDBIndex.prototype, ['get', 'getKey', 'getAll', 'getAllKeys', 'getAllRecords', 'count', 'openCursor', 'openKeyCursor']],
  ] as const) {
    for (const method of methods) {
      const original = Object.getOwnPropertyDescriptor(prototype, method);
      if (!original) continue;
      Object.defineProperty(prototype, method, { ...original, value: function(this: IDBObjectStore | IDBIndex, ...args: unknown[]) {
        const store = 'objectStore' in this ? this.objectStore : this;
        if (store.transaction.db.name === 'maze-battle') {
          forbidden.push(`${'objectStore' in this ? 'index' : 'store'}.${method}`);
          throw Error(`Unmetered native access: ${method}`);
        }
        return Reflect.apply(original.value, this, args);
      } });
      restore.push(() => Object.defineProperty(prototype, method, original));
    }
  }
  for (const method of ['get', 'add', 'put'] as const) {
    const original = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true,
      value: function(this: IDBObjectStore, ...args: unknown[]) {
        const request = Reflect.apply(original, this, args) as IDBRequest;
        if (this.transaction.db.name === 'maze-battle' && this.name === 'records') {
          if (method === 'get') request.addEventListener('success', () => {
            if (request.result) readKeys.push(request.result.key);
          }, { once: true });
          else writeKeys.push((args[0] as { key: string }).key);
        }
        return request;
      } });
    restore.push(() => Object.defineProperty(IDBObjectStore.prototype, method,
      { configurable: true, writable: true, value: original }));
  }
  active = { meter: storageProbe(), restore, readKeys, writeKeys, started: performance.now(), usage, forbidden };
}
export async function finishProbe() {
  if (!active) throw Error('Revisit probe is not running');
  const current = active; active = undefined;
  const native = current.meter.finish();
  for (const restore of current.restore.reverse()) restore();
  const writes = native.operations.filter(o => ['add', 'put', 'delete', 'clear'].includes(o.method));
  const reads = native.operations.filter(o => !writes.includes(o));
  return { elapsedMs: performance.now() - current.started, usageBefore: current.usage,
    usageAfter: (await navigator.storage.estimate()).usage, reads: reads.length, writes: writes.length,
    readBytes: reads.reduce((n, o) => n + o.logicalBytes, 0), writeBytes: writes.reduce((n, o) => n + o.logicalBytes, 0),
    readKeys: current.readKeys, writeKeys: current.writeKeys, forbidden: current.forbidden, native };
}

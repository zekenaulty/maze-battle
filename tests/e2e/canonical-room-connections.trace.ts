import { CanonicalPages } from '../../src/persistence/canonical/pages';

export const bytes = (value: unknown) => value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).length;
type Read = { area: string; key: string; bytes: number };

/** Executor-only instrumentation. GameSession's subsequent UI projection is outside this trace. */
export async function traceConnections<T>(work: () => Promise<T>, replay = false) {
  const logical: Read[] = [], native: { store: string; bytes: number; area?: string; key?: string }[] = [];
  const writes: { area: string; key: string }[] = [];
  const get = CanonicalPages.prototype.get, set = CanonicalPages.prototype.set, scan = CanonicalPages.prototype.scan;
  const nativeGet = IDBObjectStore.prototype.get;
  const blocked = new Map<string, PropertyDescriptor>();
  for (const method of ['getKey', 'getAll', 'getAllKeys', 'getAllRecords', 'count', 'openCursor', 'openKeyCursor', 'index']) {
    const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, method);
    if (!descriptor) continue;
    blocked.set(method, descriptor);
    Object.defineProperty(IDBObjectStore.prototype, method, { ...descriptor, value() { throw Error(`Untraced native read: ${method}`); } });
  }
  CanonicalPages.prototype.get = async function (area, key) {
    if (area === 'world' || replay && area !== 'execution') throw Error('Forbidden query acquisition');
    const value = await get.call(this, area, key);
    logical.push({ area, key, bytes: bytes(value) }); return value;
  };
  CanonicalPages.prototype.set = async function (area, key, value, indexes) {
    if (replay || area !== 'execution') throw Error('Forbidden query mutation');
    writes.push({ area, key }); return set.call(this, area, key, value, indexes);
  };
  CanonicalPages.prototype.scan = async function () { throw Error('Connections must not scan'); };
  IDBObjectStore.prototype.get = function (key) {
    if (native.length >= 4096) throw Error('Native trace bound exceeded');
    const entry: typeof native[number] = { store: this.name, bytes: 0 }; native.push(entry);
    const request = nativeGet.call(this, key);
    request.addEventListener('success', () => {
      const value = request.result; entry.bytes = bytes(value);
      if (entry.store === 'records' && value) { entry.area = value.area; entry.key = value.key; }
    }, { once: true });
    return request;
  };
  try {
    const value = await work();
    if (native.some(row => row.area === 'world' || replay && row.area === 'knowledge')) throw Error('Forbidden native record acquisition');
    const distinct = [...new Map(logical.filter(r => r.area === 'knowledge').map(row => [row.key, row])).values()];
    return { value, trace: { logical, native, writes, knowledgeReads: distinct.length,
      knowledgeBytes: distinct.reduce((sum, row) => sum + row.bytes, 0) } };
  } finally {
    CanonicalPages.prototype.get = get; CanonicalPages.prototype.set = set; CanonicalPages.prototype.scan = scan;
    IDBObjectStore.prototype.get = nativeGet;
    for (const [method, descriptor] of blocked) Object.defineProperty(IDBObjectStore.prototype, method, descriptor);
  }
}

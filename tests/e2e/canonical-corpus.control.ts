export interface CorpusNativeRead {
  store: string; key: unknown; caller: string; result?: unknown; bytes?: number; error?: string;
}

/** Serialized before fixture modules load. Only these isolated documents, never an owner App or provider. */
export function installCorpusControl() {
  if (!['http://127.0.0.1:5266/tests/e2e/canonical-corpus.html',
    'http://127.0.0.1:5446/tests/e2e/canonical-corpus-ui.html'].includes(location.href) || window.corpusControl)
    throw Error('Deterministic identities are restricted to a fresh isolated corpus document');
  const allocations: { id: string; caller: string }[] = [], seen = new Set<string>();
  let state = 0x731c0ffe;
  Object.defineProperty(crypto, 'randomUUID', { value: () => {
    if (allocations.length >= 50_000) throw Error('Corpus identity allocation bound exceeded');
    const bytes = Array.from({ length: 16 }, () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return state & 255;
    });
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (seen.has(id)) throw Error('Unexpected corpus UUID reuse');
    seen.add(id); allocations.push({ id, caller: new Error().stack! }); return id;
  } });
  let active = false, pending = 0, transaction: IDBTransaction | undefined;
  let reads: CorpusNativeRead[] = [], violations: string[] = [];
  const reject = (message: string): never => { violations.push(message); throw Error(message); };
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (key) {
    if (!active) return get.call(this, key);
    if (this.transaction.mode !== 'readonly' || this.transaction.db.name !== 'maze-battle')
      reject('Unexpected native transaction during corpus projection');
    transaction ??= this.transaction;
    if (transaction !== this.transaction || reads.length >= 10_000) reject('Corpus native read boundary exceeded');
    const row: CorpusNativeRead = { store: this.name, key: structuredClone(key), caller: new Error().stack! };
    reads.push(row);
    let request: IDBRequest;
    try { request = get.call(this, key); }
    catch (error) { row.error = String(error); throw error; }
    pending++;
    request.addEventListener('success', () => {
      row.result = structuredClone(request.result);
      row.bytes = request.result === undefined ? 0 : new TextEncoder().encode(JSON.stringify(request.result)).byteLength;
      pending--;
    }, { once: true });
    request.addEventListener('error', () => { row.error = String(request.error); pending--; }, { once: true });
    return request;
  };
  // Fail closed if the query gains an untraced read path or any mutation.
  for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype, IDBCursor.prototype]) {
    for (const method of ['get', 'getKey', 'getAll', 'getAllKeys', 'getAllRecords', 'count', 'openCursor',
      'openKeyCursor', 'index', 'add', 'put', 'delete', 'clear', 'update', 'advance', 'continue', 'continuePrimaryKey']) {
      if (prototype === IDBObjectStore.prototype && method === 'get') continue;
      const original = Reflect.get(prototype, method);
      if (typeof original !== 'function') continue;
      Object.defineProperty(prototype, method, { configurable: true, writable: true, value: function (...args: unknown[]) {
        if (active) reject(`Untraced native operation: ${prototype.constructor.name}.${method}`);
        return Reflect.apply(original, this, args);
      } });
    }
  }
  window.corpusControl = {
    allocations: () => structuredClone(allocations),
    begin() {
      if (active || pending) reject('Overlapping corpus native trace');
      reads = []; violations = []; transaction = undefined; active = true;
    },
    end() { active = false; if (pending) reject('Unfinished corpus native requests'); return structuredClone(reads); },
    snapshot: () => ({ active, pending, reads: structuredClone(reads), violations: [...violations] }),
  };
}

declare global {
  interface Window {
    corpusControl?: {
      allocations(): { id: string; caller: string }[];
      begin(): void; end(): CorpusNativeRead[];
      snapshot(): { active: boolean; pending: number; reads: CorpusNativeRead[]; violations: string[] };
    };
  }
}

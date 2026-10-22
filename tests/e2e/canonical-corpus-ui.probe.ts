/** Native mutation observer, installed before application modules on this exact fixture only. */
export function installCorpusUiProbe() {
  if (location.href !== 'http://127.0.0.1:5446/tests/e2e/canonical-corpus-ui.html' || window.corpusUiWrites)
    throw Error('Invalid corpus UI probe document');
  const writes: { method: string; store: string }[] = [];
  for (const [prototype, methods] of [
    [IDBObjectStore.prototype, ['add', 'put', 'delete', 'clear']],
    [IDBCursor.prototype, ['update', 'delete']],
  ] as const) {
    for (const method of methods) {
      const original = Reflect.get(prototype, method);
      Object.defineProperty(prototype, method, { configurable: true, writable: true, value: function (...args: unknown[]) {
        const source = this instanceof IDBCursor ? this.source : this;
        const store = source instanceof IDBIndex ? source.objectStore : source;
        if (store.transaction.db.name === 'maze-battle') writes.push({ method, store: store.name });
        return Reflect.apply(original, this, args);
      } });
    }
  }
  window.corpusUiWrites = () => structuredClone(writes);
}
declare global { interface Window { corpusUiWrites?: () => { method: string; store: string }[] } }

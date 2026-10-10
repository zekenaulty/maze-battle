/** Count returned cursor records/events, not just the one openCursor invocation. */
export async function traceMap<T>(operation: () => Promise<T>) {
  const prototype = IDBObjectStore.prototype;
  const getAll = prototype.getAll, openCursor = prototype.openCursor, objectStore = IDBTransaction.prototype.objectStore;
  const reads: Record<string, number> = {};
  let cursorRecords = 0, cursorEvents = 0;
  const blocked = ['get', 'getAllKeys', 'getKey', 'openKeyCursor', 'count', 'put', 'add', 'delete', 'clear'] as const;
  const originals = blocked.map(method => prototype[method]);
  IDBTransaction.prototype.objectStore = function (name) {
    if (!['roots', 'streamCheckpoints', 'streamKnowledge'].includes(name) || this.mode !== 'readonly') throw new Error('Map accessed canonical data or a write transaction');
    return objectStore.call(this, name);
  };
  prototype.getAll = function (key, count) {
    if (count !== 1 || key === undefined || key === null || key instanceof IDBKeyRange) throw new Error('Unbounded map point read');
    reads[this.name] = (reads[this.name] ?? 0) + 1;
    return getAll.call(this, key, count);
  };
  prototype.openCursor = function (range, direction) {
    if (this.name !== 'streamKnowledge' || !(range instanceof IDBKeyRange) || direction && direction !== 'next') throw new Error('Unbounded map cursor');
    const lower = range.lower, upper = range.upper;
    if (!Array.isArray(lower) || !Array.isArray(upper) || lower[0] !== upper[0] || upper.length !== 2
      || !Array.isArray(upper[1]) || upper[1].length || !range.lowerOpen || !range.upperOpen) throw new Error('Map cursor escaped slot');
    const request = openCursor.call(this, range, direction);
    request.addEventListener('success', () => { cursorEvents++; if (request.result) cursorRecords++; });
    return request;
  };
  for (const method of blocked) prototype[method] = (() => { throw new Error(`Forbidden map operation: ${method}`); }) as never;
  try {
    const result = await operation();
    if (cursorEvents > 13 || cursorRecords > 13) throw new Error('Unbounded map page');
    return { result, reads, cursorRecords, cursorEvents };
  } finally {
    prototype.getAll = getAll; prototype.openCursor = openCursor; IDBTransaction.prototype.objectStore = objectStore;
    blocked.forEach((method, index) => { prototype[method] = originals[index] as never; });
  }
}

/** Fail the final root write in this isolated native database; restore prototypes before returning. */
export async function failRootWrite<T>(work: () => Promise<T>) {
  const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'heads') throw new DOMException('Injected controller root-write failure', 'QuotaExceededError');
    return add.apply(this, args);
  };
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'heads') throw new DOMException('Injected controller root-write failure', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { return await work(); }
  finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
}

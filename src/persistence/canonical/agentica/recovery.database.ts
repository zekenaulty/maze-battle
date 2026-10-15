import { CANONICAL_DATABASE, CANONICAL_VERSION } from '../database';

/** Hold the existing schema so the ordinary reader cannot create, upgrade or race database replacement. */
export async function inRecoveryDatabase<T>(inputSignal: AbortSignal | undefined, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  inputSignal?.throwIfAborted();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    const fail = (error: unknown) => { abandoned = true; inputSignal?.removeEventListener('abort', abort); reject(error); };
    const abort = () => fail(inputSignal!.reason);
    inputSignal?.addEventListener('abort', abort, { once: true });
    const request = indexedDB.open(CANONICAL_DATABASE, CANONICAL_VERSION);
    request.onupgradeneeded = () => {
      request.transaction!.abort(); fail(new Error('Recovery requires an existing current canonical database; no upgrade was performed.'));
    };
    request.onblocked = () => fail(new Error('Recovery database open is blocked.'));
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      inputSignal?.removeEventListener('abort', abort);
      if (abandoned) request.result.close(); else resolve(request.result);
    };
  });
  const changed = new AbortController(), signal = inputSignal ? AbortSignal.any([inputSignal, changed.signal]) : changed.signal;
  db.onversionchange = () => changed.abort(new Error('Recovery database schema changed.'));
  try { signal.throwIfAborted(); const value = await read(signal); signal.throwIfAborted(); return value; }
  finally { db.close(); }
}

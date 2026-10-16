import { openCanonicalDatabase, CANONICAL_DATABASE } from '../../src/persistence/canonical/database';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import type { Json } from '../../src/persistence/canonical/types';

/** Deliberate corruption only in this namespace's disposable origin. */
export async function changeKey(key: string, value?: Json) {
  const { head } = await readCanonicalHead();
  return executeCanonical(gameRequest(head, 'fixture.proof-corruption', { key }), async tx => {
    if (value === undefined) await tx.pages.delete('execution', key);
    else await tx.pages.set('execution', key, value);
    return {};
  });
}
export async function deleteRow(store: 'records' | 'receipts', id: string) {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try { await db.delete(store, [head.gameId, id]); } finally { db.close(); }
}
export async function observeReads<T>(work: () => Promise<T>) {
  const original = IDBDatabase.prototype.transaction, modes: string[] = [];
  IDBDatabase.prototype.transaction = function (stores, mode, options) {
    if (this.name === CANONICAL_DATABASE) modes.push(mode ?? 'readonly');
    return original.call(this, stores, mode, options);
  };
  try { return { result: await work(), modes }; }
  finally { IDBDatabase.prototype.transaction = original; }
}

import { openDB, type DBSchema, type IDBPTransaction } from 'idb';
import type { DirectedReceipt, DirectedSession } from '../../domain/directed/operationTypes';
import type { DirectedWorld, KnowledgeProjection, ObservationReceipt, PresentedContext, WorldEvent } from '../../domain/directed/types';

export const DIRECTED_DATABASE = 'maze-battle-directed-v1';
export const JOURNALS = ['observations', 'projections', 'events', 'contexts', 'receipts'] as const;
export type Counts = Record<typeof JOURNALS[number], number>;
export interface SaveRecord { session: DirectedSession; counts: Counts }
export interface DirectedDatabase extends DBSchema {
  saves: { key: string; value: SaveRecord };
  worlds: { key: string; value: DirectedWorld };
  observations: { key: [string, number]; value: ObservationReceipt };
  projections: { key: [string, number]; value: KnowledgeProjection };
  events: { key: [string, number]; value: WorldEvent };
  contexts: { key: [string, string]; value: PresentedContext };
  receipts: { key: [string, string]; value: DirectedReceipt };
}
const STORES = ['saves', 'worlds', ...JOURNALS] as const;
export type DirectedTransaction = IDBPTransaction<DirectedDatabase, typeof STORES, 'readwrite'>;
export const slotRange = (slot: string) => IDBKeyRange.bound([slot], [slot, []]);

/** No legacy imports, discovery, upgrades, resets, or deletion paths. */
export async function transaction<T>(work: (tx: DirectedTransaction) => Promise<T>): Promise<T> {
  const database = await openDB<DirectedDatabase>(DIRECTED_DATABASE, 1, {
    upgrade(db) { for (const name of STORES) db.createObjectStore(name); },
  });
  const tx = database.transaction(STORES, 'readwrite', { durability: 'strict' });
  // Observe aborts immediately, including failures in application validation.
  const done = tx.done;
  void done.catch(() => {});
  try {
    const result = await work(tx);
    await done;
    return structuredClone(result);
  } catch (error) {
    try { tx.abort(); } catch { /* A failed IDB request may already have aborted. */ }
    await done.catch(() => {});
    throw error;
  } finally { database.close(); }
}

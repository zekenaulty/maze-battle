import { openDB, type DBSchema, type IDBPTransaction } from 'idb';
import type { ExpeditionCheckpoint, ExpeditionPlan } from '../domain/expedition/types';
import type { DurableExpeditionReceipt, DurableExpeditionSession } from './expeditionActionTypes';

export type ExpeditionRecord = { plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint };
interface ExpeditionDb extends DBSchema {
  expeditions: { key: string; value: ExpeditionRecord };
  actionSessions: { key: string; value: DurableExpeditionSession };
  actionReceipts: { key: [string, string]; value: DurableExpeditionReceipt };
}

export function openExpeditionDatabase() {
  return openDB<ExpeditionDb>('maze-battle-expeditions', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('expeditions');
      // Additive migration: never read, regenerate, or rewrite v1 expedition values.
      if (oldVersion < 2) {
        db.createObjectStore('actionSessions');
        db.createObjectStore('actionReceipts');
      }
    },
  });
}

type Transaction<Mode extends 'readonly' | 'readwrite'> = IDBPTransaction<ExpeditionDb, ['expeditions', 'actionSessions', 'actionReceipts'], Mode>;

/** All writers share the same lock scope, including legacy save/delete operations. */
export async function expeditionTransaction<Mode extends 'readonly' | 'readwrite', T>(mode: Mode, operation: (tx: Transaction<Mode>) => Promise<T>): Promise<T> {
  const db = await openExpeditionDatabase();
  try {
    const tx = db.transaction(['expeditions', 'actionSessions', 'actionReceipts'], mode);
    try {
      const value = await operation(tx);
      await tx.done;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* A request failure may have already aborted. */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}

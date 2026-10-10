import { openDB, type DBSchema } from 'idb';
import type { PlayTelemetry } from '../domain/telemetry/types';
import { getDatabase } from './saveRepository';
import { requireControl, type SaveControl } from './saveControl';

interface TelemetryDb extends DBSchema {
  runs: { key: string; value: PlayTelemetry; indexes: { byUpdatedAt: string } };
}

const database = () => openDB<TelemetryDb>('maze-battle-telemetry', 1, {
  upgrade(db) {
    db.createObjectStore('runs', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
  },
});

export async function loadTelemetry(gameId: string) {
  const current = await (await getDatabase()).get('telemetry', gameId);
  if (current) return current;
  const db = await database();
  try { return await db.get('runs', gameId); } finally { db.close(); }
}

export async function saveTelemetry(log: PlayTelemetry, control: SaveControl) {
  const db = await getDatabase();
  const tx = db.transaction(['meta', 'telemetry'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    await requireControl(tx, control);
    const store = tx.objectStore('telemetry');
    const existing = await store.get(log.gameId);
    if (existing && existing.sequence > log.sequence) throw new Error('Diagnostics sequence cannot regress.');
    await store.put(log);
    const keys = await store.index('byUpdatedAt').getAllKeys();
    for (const key of keys.slice(0, Math.max(0, keys.length - 8))) await store.delete(key);
    await tx.done;
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

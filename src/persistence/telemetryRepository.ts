import { openDB, type DBSchema } from 'idb';
import type { PlayTelemetry } from '../domain/telemetry/types';

interface TelemetryDb extends DBSchema {
  runs: { key: string; value: PlayTelemetry; indexes: { byUpdatedAt: string } };
}

const database = () => openDB<TelemetryDb>('maze-battle-telemetry', 1, {
  upgrade(db) {
    db.createObjectStore('runs', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
  },
});

export async function loadTelemetry(gameId: string) {
  const db = await database();
  try { return await db.get('runs', gameId); } finally { db.close(); }
}

export async function saveTelemetry(log: PlayTelemetry) {
  const db = await database();
  try {
    const tx = db.transaction('runs', 'readwrite');
    await tx.store.put(log);
    const keys = await tx.store.index('byUpdatedAt').getAllKeys();
    for (const key of keys.slice(0, Math.max(0, keys.length - 8))) await tx.store.delete(key);
    await tx.done;
  } finally { db.close(); }
}

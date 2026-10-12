import type { PlayTelemetry } from '../domain/telemetry/types';
import { getDatabase } from './saveRepository';
import { requireControl, type SaveControl } from './saveControl';

export async function loadTelemetry(gameId: string) {
  return (await getDatabase()).get('telemetry', gameId);
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

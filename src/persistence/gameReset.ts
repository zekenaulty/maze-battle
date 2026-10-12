import { createNewGameState } from '../domain/gameFactory';
import { createPlayTelemetry } from '../domain/telemetry/transitions';
import type { OwnedGame } from './gameCustody';
import { appendRpgObservation } from './observationArchive';
import { putControl } from './saveControl';
import { getDatabase } from './saveRepository';

/** Explicit destructive recovery only. Never read, validate, or repair the discarded history. */
export async function resetGame(): Promise<OwnedGame> {
  const game = createNewGameState();
  // A fresh identity fences old writers even when the previous control cannot be decoded.
  const control = { owner: crypto.randomUUID(), epoch: 1, revision: 1 };
  const db = await getDatabase();
  const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
  void tx.done.catch(() => {});
  try {
    for (const name of db.objectStoreNames) await tx.objectStore(name).clear();
    await putControl(tx, control);
    const observationHead = await appendRpgObservation(tx, game, control);
    if (!observationHead) throw new Error('New game observation is unavailable.');
    await tx.objectStore('saves').put({ slotId: 'auto', kind: 'auto', label: 'Auto Save',
      game, observationHead, createdAt: game.createdAt, updatedAt: game.updatedAt });
    await tx.objectStore('telemetry').put(createPlayTelemetry(game.id));
    await tx.done;
    return { game, control, observationHead };
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

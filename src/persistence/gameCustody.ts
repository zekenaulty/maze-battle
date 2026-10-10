import { createNewGameState, normalizeGameState } from '../domain/gameFactory';
import type { GameState, SaveSlot } from '../domain/types';
import { getDatabase } from './saveRepository';
import { AUTO_CONTROL_KEY, decodeControl, putControl, requireControl, type SaveControl } from './saveControl';

export interface OwnedGame { control: SaveControl; game: GameState }

export async function readGameControl() {
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves'], 'readonly');
  const control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY));
  const slot = await tx.objectStore('saves').get('auto');
  await tx.done;
  return { control, game: slot?.game };
}

export async function claimGame(owner: string, takeover = false): Promise<OwnedGame> {
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    let control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY));
    const previous = await tx.objectStore('saves').get('auto');
    if (control && !previous) throw new Error('The controlled autosave is missing. Existing saves were left unchanged.');
    if (!control || !control.owner || takeover) {
      control = { owner, epoch: (control?.epoch ?? 0) + 1, revision: (control?.revision ?? 0) + 1 };
      await putControl(tx, control);
    }
    const game = previous ? normalizeGameState(previous.game) : createNewGameState();
    if (control.owner === owner) await tx.objectStore('saves').put(autoSlot(game, previous));
    await tx.done;
    return { control, game };
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

function autoSlot(game: GameState, previous?: SaveSlot): SaveSlot {
  return { slotId: 'auto', label: 'Auto Save', kind: 'auto', game,
    createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: game.updatedAt };
}

/** The reducer runs only after the durable fence, inside the same write transaction. */
export async function updateOwnedGame(expected: SaveControl, update: (game: GameState) => GameState): Promise<OwnedGame> {
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const control = await requireControl(tx, expected);
    const previous = await tx.objectStore('saves').get('auto');
    if (!previous) throw new Error('Autosave is unavailable.');
    const game = update(previous.game);
    const next = { ...control, revision: control.revision + 1 };
    await tx.objectStore('saves').put(autoSlot(game, previous));
    await putControl(tx, next);
    await tx.done;
    return { control: next, game };
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

export async function changeOwnedSave(expected: SaveControl, action: { type: 'create'; label: string } | { type: 'delete'; slotId: string }): Promise<SaveControl> {
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const control = await requireControl(tx, expected), store = tx.objectStore('saves');
    if (action.type === 'create') {
      const current = await store.get('auto');
      if (!current) throw new Error('Autosave is unavailable.');
      await store.add({ ...current, slotId: `manual-${crypto.randomUUID()}`, label: action.label, kind: 'manual' });
    } else {
      await store.delete(action.slotId);
      // Deleting the autosave never deletes the durable fence or the active expedition.
      if (action.slotId === 'auto') throw new Error('The active autosave cannot be deleted. Start a new game instead.');
    }
    const next = { ...control, revision: control.revision + 1 };
    await putControl(tx, next);
    await tx.done;
    return next;
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

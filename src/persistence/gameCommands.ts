import { applyGameCommand } from '../domain/gameCommands';
import { samePosition } from '../domain/maze/key';
import { getDatabase } from './saveRepository';
import { AUTO_CONTROL_KEY, decodeControl, putControl, sameOwner } from './saveControl';
import type { OwnedGame } from './gameCustody';
import type { GameCommandReceipt, GameCommandRequest } from './gameCommandTypes';
import { commandFingerprint, validateCommandReceipt } from './gameCommandValidation';
import { appendRpgObservation } from './observationArchive';

export interface GameCommandCommit { receipt: GameCommandReceipt; replayed: boolean; current?: OwnedGame }

export async function readGameCommand(request: GameCommandRequest) {
  const fingerprint = commandFingerprint(request), db = await getDatabase();
  const stored = await db.get('gameCommands', request.attemptId);
  return stored ? validateCommandReceipt(stored, request, fingerprint) : undefined;
}

export function executeOwnedGameCommand(request: GameCommandRequest): Promise<GameCommandCommit> {
  return commit(request, false);
}

/** Serializes against execution. A missing original becomes terminal without any effect. */
export function settleGameCommand(request: GameCommandRequest): Promise<GameCommandCommit> {
  return commit(request, true);
}

async function commit(request: GameCommandRequest, settleOnly: boolean): Promise<GameCommandCommit> {
  const fingerprint = commandFingerprint(request), input: GameCommandRequest = JSON.parse(fingerprint);
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves', 'gameCommands', 'observations'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const store = tx.objectStore('gameCommands'), stored = await store.get(input.attemptId);
    const control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY));
    const previous = await tx.objectStore('saves').get('auto');
    const current = control && previous ? { control, game: previous.game } : undefined;
    // The original wins even after deadline, manual play, replacement or takeover.
    if (stored) {
      const receipt = validateCommandReceipt(stored, input, fingerprint);
      await tx.done;
      return { receipt, replayed: true, current };
    }
    let reason: 'settled' | 'conflict' | 'expired' | undefined;
    if (settleOnly) reason = 'settled';
    else if (!current || !sameOwner(control, input.control) || control!.revision !== input.control.revision
      || current.game.id !== input.gameId || current.game.dungeonLevel !== input.floor
      || !samePosition(current.game.maze.active, input.position)) reason = 'conflict';
    else if (Date.now() >= input.deadlineAt) reason = 'expired';
    const beforeRevision = control?.revision ?? input.control.revision;
    let next = current;
    let observationHead: string | undefined;
    let outcome: GameCommandReceipt['outcome'];
    if (reason) outcome = { status: 'not-applied', reason };
    else {
      const applied = applyGameCommand(current!.game, input.command);
      if (Date.now() >= input.deadlineAt) throw new Error('Game command expired before commit. Reconcile its original attempt.');
      const afterControl = { ...current!.control, revision: beforeRevision + 1 };
      observationHead = await appendRpgObservation(tx, applied.game, afterControl, previous!.observationHead);
      await tx.objectStore('saves').put({ ...previous!, game: applied.game, updatedAt: applied.game.updatedAt,
        ...(observationHead ? { observationHead } : {}) });
      await putControl(tx, afterControl);
      next = { control: afterControl, game: applied.game };
      outcome = applied.outcome;
    }
    const receipt: GameCommandReceipt = { version: 1, attemptId: input.attemptId, fingerprint, gameId: input.gameId,
      beforeRevision, afterRevision: next?.control.revision ?? beforeRevision, committedAt: Date.now(), outcome,
      ...(observationHead ? { observationHead } : {}) };
    validateCommandReceipt(receipt, input, fingerprint);
    if (!reason && Date.now() >= input.deadlineAt) throw new Error('Game command expired before commit. Reconcile its original attempt.');
    await store.add(receipt);
    await tx.done;
    return { receipt, replayed: false, current: next };
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

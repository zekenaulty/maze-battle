import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeGameState, summarizeGame } from '../domain/gameFactory';
import type { GameState, SaveKind, SaveSlot, SaveSummary } from '../domain/types';
import type { PlayTelemetry } from '../domain/telemetry/types';
import { AUTO_CONTROL_KEY, SaveOwnershipError } from './saveControl';
import type { GameCommandReceipt } from './gameCommandTypes';
import type { RpgObservationNode } from './observationTypes';

const DB_NAME = 'maze-battle';
const DB_VERSION = 4;

export interface MazeBattleDb extends DBSchema {
  observations: { key: string; value: RpgObservationNode; indexes: { byGameId: string } };
  gameCommands: { key: string; value: GameCommandReceipt; indexes: { byGameId: string } };
  telemetry: { key: string; value: PlayTelemetry; indexes: { byUpdatedAt: string } };
  saves: {
    key: string;
    value: SaveSlot;
    indexes: {
      byUpdatedAt: string;
      byKind: SaveKind;
    };
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MazeBattleDb>> | undefined;

export function getDatabase() {
  dbPromise ??= openDB<MazeBattleDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('observations')) {
        db.createObjectStore('observations', { keyPath: 'id' }).createIndex('byGameId', 'gameId');
      }
      if (!db.objectStoreNames.contains('gameCommands')) {
        db.createObjectStore('gameCommands', { keyPath: 'attemptId' }).createIndex('byGameId', 'gameId');
      }
      if (!db.objectStoreNames.contains('saves')) {
        const saves = db.createObjectStore('saves', { keyPath: 'slotId' });
        saves.createIndex('byUpdatedAt', 'updatedAt');
        saves.createIndex('byKind', 'kind');
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('telemetry')) {
        db.createObjectStore('telemetry', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
      }
    },
    blocking() { void dbPromise?.then(db => db.close()); dbPromise = undefined; },
  });

  return dbPromise;
}

export async function saveGame(slotId: string, label: string, kind: SaveKind, game: GameState) {
  const db = await getDatabase();
  const tx = db.transaction(['saves', 'meta'], 'readwrite');
  const done = tx.done;
  void done.catch(() => {});
  if (await tx.objectStore('meta').get(AUTO_CONTROL_KEY)) { tx.abort(); throw new SaveOwnershipError(); }
  const existing = await tx.objectStore('saves').get(slotId);
  const normalizedGame = normalizeGameState(game);
  const slot: SaveSlot = {
    slotId,
    label,
    kind,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: normalizedGame.updatedAt,
    game: normalizedGame,
  };

  await tx.objectStore('saves').put(slot);
  await done;
  return slot;
}

export async function getGame(slotId: string) {
  const db = await getDatabase();
  const slot = await db.get('saves', slotId);
  return slot ? { ...slot, game: normalizeGameState(slot.game) } : undefined;
}

export async function listSaves(): Promise<SaveSummary[]> {
  const db = await getDatabase();
  const slots = await db.getAll('saves');

  return slots
    .map((slot) => {
      const game = normalizeGameState(slot.game);
      const summary = summarizeGame(game);
      return {
        slotId: slot.slotId,
        label: slot.label,
        kind: slot.kind,
        updatedAt: game.updatedAt,
        dungeonLevel: summary.dungeonLevel,
        partyLevels: summary.partyLevels,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSave(slotId: string) {
  const db = await getDatabase();
  const tx = db.transaction(['saves', 'meta'], 'readwrite');
  void tx.done.catch(() => {});
  if (await tx.objectStore('meta').get(AUTO_CONTROL_KEY)) { tx.abort(); throw new SaveOwnershipError(); }
  await tx.objectStore('saves').delete(slotId);
  await tx.done;
}

export async function getMeta(key: string) {
  const db = await getDatabase();
  return db.get('meta', key);
}

export async function setMeta(key: string, value: string) {
  const db = await getDatabase();
  await db.put('meta', { key, value });
}

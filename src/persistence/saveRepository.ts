import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeGameState, summarizeGame } from '../domain/gameFactory';
import type { GameState, SaveKind, SaveSlot, SaveSummary } from '../domain/types';

const DB_NAME = 'maze-battle';
const DB_VERSION = 1;

interface MazeBattleDb extends DBSchema {
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
      if (!db.objectStoreNames.contains('saves')) {
        const saves = db.createObjectStore('saves', { keyPath: 'slotId' });
        saves.createIndex('byUpdatedAt', 'updatedAt');
        saves.createIndex('byKind', 'kind');
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });

  return dbPromise;
}

export async function saveGame(slotId: string, label: string, kind: SaveKind, game: GameState) {
  const db = await getDatabase();
  const existing = await db.get('saves', slotId);
  const normalizedGame = normalizeGameState(game);
  const slot: SaveSlot = {
    slotId,
    label,
    kind,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: normalizedGame.updatedAt,
    game: normalizedGame,
  };

  await db.put('saves', slot);
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
  await db.delete('saves', slotId);
}

export async function getMeta(key: string) {
  const db = await getDatabase();
  return db.get('meta', key);
}

export async function setMeta(key: string, value: string) {
  const db = await getDatabase();
  await db.put('meta', { key, value });
}

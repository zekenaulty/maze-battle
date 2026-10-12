import type { IDBPTransaction, StoreNames } from 'idb';
import type { MazeBattleDb } from './saveRepository';

/** Shared helpers use only their named stores inside a caller-owned atomic write. */
export type GameWrite = IDBPTransaction<MazeBattleDb, StoreNames<MazeBattleDb>[], 'readwrite'>;

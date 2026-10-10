import type { IDBPTransaction } from 'idb';
import type { MazeBattleDb } from './saveRepository';

export const AUTO_CONTROL_KEY = 'control:auto';
export interface SaveControl { owner: string; epoch: number; revision: number }
type ControlTransaction = IDBPTransaction<MazeBattleDb, ('saves' | 'meta' | 'telemetry')[], 'readwrite'>;

export class SaveOwnershipError extends Error {
  constructor() { super('Another tab owns this game. Take control to continue.'); }
}

export function decodeControl(raw: { value: string } | undefined): SaveControl | undefined {
  if (!raw) return;
  const value = JSON.parse(raw.value) as SaveControl;
  if (!value || typeof value.owner !== 'string' || !Number.isSafeInteger(value.epoch) || value.epoch < 1
    || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid save control record.');
  return value;
}

export function sameOwner(a: SaveControl | undefined, b: SaveControl | undefined) {
  return !!a && !!b && a.owner === b.owner && a.epoch === b.epoch;
}

export async function requireControl(tx: ControlTransaction, expected: SaveControl) {
  const current = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY));
  if (!sameOwner(current, expected) || current!.revision !== expected.revision) throw new SaveOwnershipError();
  return current!;
}

export async function putControl(tx: ControlTransaction, control: SaveControl) {
  if (!Number.isSafeInteger(control.epoch) || !Number.isSafeInteger(control.revision)) throw new Error('Save control exhausted.');
  await tx.objectStore('meta').put({ key: AUTO_CONTROL_KEY, value: JSON.stringify(control) });
}

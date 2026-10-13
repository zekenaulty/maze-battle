import type { CanonicalPages } from '../pages';
import type { GameCheckpoint } from '../game/checkpoint';
import { json } from '../world/records';
import { check } from '../validation';
import { id, natural } from '../roster/codec';
import { readCanonical } from '../read';
import type { CanonicalSnapshot } from '../types';
import { validateAutoRoom, validateAutoState } from './validation';
import type { AutoRoom, AutoState } from './types';

export const AUTO_STATE_KEY = 'auto/control';
type Read = Pick<CanonicalPages, 'get'>;
export function autoRoomKey(level: number, spaceId: string) { natural(level, 1); id(spaceId); return `auto/room/${level}/${spaceId}`; }
export async function loadAutoState(pages: Read): Promise<AutoState | null> {
  const row = await pages.get('world', AUTO_STATE_KEY); if (!row) return null;
  check(row.indexes.length === 0, 'unexpected Auto indexes'); validateAutoState(row.value); return row.value;
}
export async function loadAutoRoom(pages: Read, state: AutoState, spaceId: string): Promise<AutoRoom | null> {
  const row = await pages.get('world', autoRoomKey(state.level, spaceId)); if (!row) return null;
  validateAutoRoom(row.value);
  check(row.value.spaceId === spaceId && row.value.level === state.level && row.indexes.length === 0, 'foreign Auto room');
  return row.value.runId === state.runId ? row.value : null;
}
export async function saveAutoState(pages: Pick<CanonicalPages, 'set'>, state: AutoState) {
  validateAutoState(state); await pages.set('world', AUTO_STATE_KEY, json(state));
}
export async function saveAutoRoom(pages: Pick<CanonicalPages, 'set'>, room: AutoRoom) {
  validateAutoRoom(room); await pages.set('world', autoRoomKey(room.level, room.spaceId), json(room));
}
export function initialAutoState(checkpoint: GameCheckpoint, revision: number): AutoState {
  return { schema: 1, level: checkpoint.position.level, runId: crypto.randomUUID(), rootId: checkpoint.position.cell.spaceId,
    lastPosition: checkpoint.position, lastRevision: revision, status: 'running', reason: 'Planning earned floor work.',
    objective: null, route: null, search: null, descent: null, completed: false, townServiced: false };
}
export const readAutoState = (snapshot: CanonicalSnapshot, signal?: AbortSignal) => readCanonical(loadAutoState, { snapshot, signal });

import type { MazeRoomKind, MazeRoomState } from '../types';
import { validateSeed } from '../expedition/schematic';
import { keyedSeed } from '../expedition/topology/seed';
import { roomTagsForKind } from './structuredRooms';

const SPECIALTIES: readonly MazeRoomKind[] = ['treasure', 'boss', 'safe', 'treasure', 'safe'];
const CANDIDATE_LIMIT = SPECIALTIES.length + 1;
const NAMES: Record<MazeRoomKind, string> = {
  start: 'Entry Hall', exit: 'Descent Gate', hub: 'Central Hub', ordinary: 'Chamber',
  treasure: 'Vault', boss: 'Guard Post', safe: 'Sanctuary',
};

export interface ModuleRoleScope {
  readonly entryId: string;
  readonly exitId: string;
  readonly seed: number;
}
export interface ModuleRoleRoom { readonly id: string; readonly degree: number }
export interface ModuleRoleCandidate { readonly id: string; readonly rank: number }
export interface ModuleRoleAccumulator extends ModuleRoleScope {
  readonly roomCount: number;
  readonly entrySeen: boolean;
  readonly exitSeen: boolean;
  readonly hub: ModuleRoleRoom | null;
  readonly specialties: readonly ModuleRoleCandidate[];
}
export interface ModuleRolePlan {
  readonly entryId: string;
  readonly exitId: string;
  readonly hubId: string;
  readonly specialtyIds: readonly string[];
}

export function createModuleRoleAccumulator(scope: ModuleRoleScope): ModuleRoleAccumulator {
  validateScope(scope);
  return { entryId: scope.entryId, exitId: scope.exitId, seed: scope.seed,
    roomCount: 0, entrySeen: false, exitSeen: false, hub: null, specialties: [] };
}

/**
 * Visit each unique room exactly once, with final degrees and fixed entry/exit.
 * The caller owns complete traversal and replay protection: discarded identities
 * cannot be deduplicated in bounded state. Only retained duplicates can be rejected.
 * All state is JSON data; IDs are bounded like space IDs, so each step is bounded.
 */
export function accumulateModuleRole(state: ModuleRoleAccumulator, room: ModuleRoleRoom): ModuleRoleAccumulator {
  validateAccumulator(state);
  validateRoom(room);
  if (state.roomCount === Number.MAX_SAFE_INTEGER) throw new Error('Room count exceeds safe integer arithmetic');
  if ((room.id === state.entryId && state.entrySeen) || (room.id === state.exitId && state.exitSeen)
    || room.id === state.hub?.id || state.specialties.some(candidate => candidate.id === room.id)) {
    throw new Error('Duplicate module identity');
  }
  let hub = state.hub;
  let specialties = state.specialties;
  if (room.id !== state.entryId && room.id !== state.exitId) {
    if (!hub || room.degree > hub.degree || (room.degree === hub.degree && room.id < hub.id)) {
      hub = { id: room.id, degree: room.degree };
    }
    // Six candidates suffice even when the eventual hub displaces one of them.
    specialties = [...specialties, { id: room.id, rank: keyedSeed(state.seed, `${room.id}:role`) }]
      .sort(compareSpecialties).slice(0, CANDIDATE_LIMIT);
  }
  return { entryId: state.entryId, exitId: state.exitId, seed: state.seed,
    roomCount: state.roomCount + 1, entrySeen: state.entrySeen || room.id === state.entryId,
    exitSeen: state.exitSeen || room.id === state.exitId, hub, specialties };
}

export function finalizeModuleRolePlan(state: ModuleRoleAccumulator): ModuleRolePlan {
  validateAccumulator(state);
  if (state.roomCount < 3 || !state.hub) throw new Error('A floor needs entry, hub and exit rooms');
  if (!state.entrySeen || !state.exitSeen) throw new Error('Missing entry or exit room');
  return { entryId: state.entryId, exitId: state.exitId, hubId: state.hub.id,
    specialtyIds: state.specialties.filter(candidate => candidate.id !== state.hub!.id)
      .slice(0, SPECIALTIES.length).map(candidate => candidate.id) };
}

/** Exact identity lookup, not an existence check; every other room is ordinary. */
export function resolveModuleRoomRole(plan: ModuleRolePlan, roomId: string): Pick<MazeRoomState, 'kind' | 'name' | 'tags'> {
  validatePlan(plan);
  validateId(roomId);
  const specialty = plan.specialtyIds.indexOf(roomId);
  const kind = roomId === plan.entryId ? 'start' : roomId === plan.exitId ? 'exit' : roomId === plan.hubId ? 'hub'
    : specialty >= 0 ? SPECIALTIES[specialty] : 'ordinary';
  return { kind, name: NAMES[kind], tags: roomTagsForKind(kind) };
}

function compareSpecialties(a: ModuleRoleCandidate, b: ModuleRoleCandidate): number {
  // Preserve the old locale tie-break (hub/exit instead use code-unit ordering).
  // Distinct IDs collating equally need a final code-unit tie-break for input-order independence.
  return a.rank - b.rank || a.id.localeCompare(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function validateId(id: string) {
  if (typeof id !== 'string' || id.length > 128 || !id.trim()) throw new Error('Invalid module identity');
}

function validateScope(scope: ModuleRoleScope) {
  if (!scope) throw new Error('Missing module role scope');
  validateId(scope.entryId);
  validateId(scope.exitId);
  if (scope.entryId === scope.exitId) throw new Error('Entry and exit must be distinct rooms');
  validateSeed(scope.seed);
}

function validateRoom(room: ModuleRoleRoom) {
  if (!room) throw new Error('Missing module room');
  validateId(room.id);
  if (!Number.isSafeInteger(room.degree) || room.degree < 0) throw new Error('Invalid room degree');
}

function validateAccumulator(state: ModuleRoleAccumulator) {
  validateScope(state);
  if (!Number.isSafeInteger(state.roomCount) || state.roomCount < 0
    || typeof state.entrySeen !== 'boolean' || typeof state.exitSeen !== 'boolean'
    || !Array.isArray(state.specialties) || state.specialties.length > CANDIDATE_LIMIT) {
    throw new Error('Invalid module role accumulator');
  }
  const candidates = state.roomCount - Number(state.entrySeen) - Number(state.exitSeen);
  if (candidates < 0 || state.specialties.length !== Math.min(candidates, CANDIDATE_LIMIT)
    || (state.hub === null) !== (candidates === 0)) throw new Error('Inconsistent room count');
  if (state.hub !== null) {
    validateRoom(state.hub);
    if (state.hub.id === state.entryId || state.hub.id === state.exitId) throw new Error('Invalid hub candidate');
  }
  const ids = new Set([state.entryId, state.exitId]);
  for (let index = 0; index < state.specialties.length; index++) {
    const candidate = state.specialties[index];
    if (!candidate) throw new Error('Invalid specialty candidate');
    validateId(candidate.id);
    if (ids.has(candidate.id) || candidate.rank !== keyedSeed(state.seed, `${candidate.id}:role`)
      || (index > 0 && compareSpecialties(state.specialties[index - 1], candidate) >= 0)) {
      throw new Error('Invalid specialty candidate');
    }
    ids.add(candidate.id);
  }
  if (state.hub && candidates <= CANDIDATE_LIMIT && !ids.has(state.hub.id)) throw new Error('Missing hub candidate');
}

function validatePlan(plan: ModuleRolePlan) {
  if (!plan || !Array.isArray(plan.specialtyIds) || plan.specialtyIds.length > SPECIALTIES.length) {
    throw new Error('Invalid module role plan');
  }
  const ids = [plan.entryId, plan.exitId, plan.hubId, ...plan.specialtyIds];
  ids.forEach(validateId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate module role identity');
}

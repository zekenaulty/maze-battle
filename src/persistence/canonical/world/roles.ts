import { accumulateModuleRole, createModuleRoleAccumulator, finalizeModuleRolePlan, resolveModuleRoomRole,
  type ModuleRoleAccumulator, type ModuleRolePlan } from '../../../domain/maze/moduleRolePlan';
import { keyedSeed } from '../../../domain/expedition/topology/seed';
import type { CanonicalPages } from '../pages';
import { check, integer, isObject, jsonBytes } from '../validation';
import { json, levelKey, loadFloor, loadWorld, same } from './records';
import { loadWorldRoom } from './residency';
import type { WorldFloor, WorldRead } from './types';
import { isModuleChamber, moduleChambersInPrefix } from '../../../domain/expedition/topology/modules/intent';

export interface WorldRoleBinding {
  readonly scopeId: string;
  readonly revision: number;
  readonly roomCount: number;
  readonly entryId: string;
  readonly exitId: string;
}
export interface WorldRoleCompilation {
  readonly schema: 1;
  readonly level: number;
  readonly binding: WorldRoleBinding;
  readonly nextRoom: number;
  readonly accumulator: ModuleRoleAccumulator;
  readonly plan: ModuleRolePlan | null;
}

// Eight anchored modules = sixteen space/ports records, plus at most 32 local connections.
export const MAX_ROLE_ROOMS_PER_ADVANCE = 8;
const MAX_ROLE_RECORD_BYTES = 4096;
const rolesKey = (level: number) => `${levelKey(level)}/roles`;
const roomIdAt = (ordinal: number) => ordinal === 0 ? 'entry' : `socket-${ordinal - 1}:room`;

/** Engine-owned preparation only, never D1 quality, content finalization or agent knowledge.
 * Call within executeCanonical; retry the ORIGINAL kernel attempt after an uncertain outcome. */
export async function beginWorldRoomRoles(pages: CanonicalPages, level: number): Promise<WorldRoleCompilation> {
  const context = await completedFloor(pages, level);
  const prior = await pages.get('world', rolesKey(level));
  if (prior) return validateCompilation(prior.value, context);
  const { binding, floor } = context;
  const state: WorldRoleCompilation = { schema: 1, level, binding, nextRoom: 0, plan: null,
    accumulator: createModuleRoleAccumulator({ entryId: binding.entryId, exitId: binding.exitId, seed: floor.generation.recipe.seed }) };
  await pages.set('world', rolesKey(level), json(state));
  return state;
}

/** Cursor visits every anchored module; accumulator admits only chambers.
 * Both publish together in one world record. No scans or growing manifest. */
export async function advanceWorldRoomRoles(pages: CanonicalPages, level: number,
  maxRooms = MAX_ROLE_ROOMS_PER_ADVANCE): Promise<WorldRoleCompilation> {
  check(integer(maxRooms, 1) && maxRooms <= MAX_ROLE_ROOMS_PER_ADVANCE, 'invalid role advance limit');
  const context = await completedFloor(pages, level);
  const state = await compilation(pages, context);
  if (state.plan) return state;
  let accumulator = state.accumulator, nextRoom = state.nextRoom;
  const end = nextRoom + Math.min(maxRooms, state.binding.roomCount - nextRoom);
  while (nextRoom < end) {
    const id = roomIdAt(nextRoom);
    const degree = await roomDegree(pages, context.floor, id);
    if (isModuleChamber(context.floor.generation.recipe, id)) accumulator = accumulateModuleRole(accumulator, { id, degree });
    nextRoom++;
  }
  const next: WorldRoleCompilation = { ...state, nextRoom, accumulator,
    plan: nextRoom === state.binding.roomCount ? finalizeModuleRolePlan(accumulator) : null };
  validateCompilation(next, context);
  await pages.set('world', rolesKey(level), json(next));
  return next;
}

export async function loadWorldRoleCompilation(pages: WorldRead, level: number): Promise<WorldRoleCompilation> {
  return compilation(pages, await completedFloor(pages, level));
}

/** Authoritative metadata for an EXISTING room only; deliberately not a knowledge projection. */
export async function loadWorldRoomRole(pages: WorldRead, level: number, id: string) {
  const context = await completedFloor(pages, level);
  const state = await compilation(pages, context);
  check(state.plan, 'room roles are not prepared');
  roomOrdinal(id, state.binding.roomCount);
  check(isModuleChamber(context.floor.generation.recipe, id), 'circulation has no room role');
  await roomDegree(pages, context.floor, id);
  return resolveModuleRoomRole(state.plan, id);
}

async function completedFloor(pages: WorldRead, level: number) {
  const floor = await loadFloor(pages, level), world = await loadWorld(pages), g = floor.generation;
  check(g.recipe.worldId === world.worldId && level <= world.deepestLevel, 'foreign role floor');
  check(floor.exit && g.rooms === g.recipe.roomBudget && g.pendingCount === 0
    && g.nextSequence === g.revision, 'role preparation requires completed generation');
  check(g.scopeId.length <= 1024, 'role generation scope exceeds bound');
  check(roomOrdinal(floor.exit.spaceId, g.rooms) > 0, 'invalid role exit');
  check(isModuleChamber(g.recipe, floor.exit.spaceId), 'role exit is not a chamber');
  const binding: WorldRoleBinding = { scopeId: g.scopeId, revision: g.revision, roomCount: g.rooms,
    entryId: floor.entry.spaceId, exitId: floor.exit.spaceId };
  return { floor, binding };
}

async function compilation(pages: WorldRead, context: Awaited<ReturnType<typeof completedFloor>>) {
  const row = await pages.get('world', rolesKey(context.floor.level));
  check(row, 'room role compilation has not begun');
  return validateCompilation(row.value, context);
}

function fields(value: unknown, keys: string) {
  check(isObject(value) && Object.keys(value).sort().join(',') === keys, 'invalid room role fields');
}

function roomOrdinal(id: string, roomCount: number): number {
  check(typeof id === 'string' && id.length <= 128, 'invalid role room identity');
  if (id === 'entry') return 0;
  const match = /^socket-(0|[1-9]\d*):room$/.exec(id);
  const ordinal = match ? Number(match[1]) + 1 : NaN;
  check(integer(ordinal, 1) && ordinal < roomCount && roomIdAt(ordinal) === id, 'invalid role room identity');
  return ordinal;
}

function validateCompilation(value: unknown, { floor, binding }: Awaited<ReturnType<typeof completedFloor>>): WorldRoleCompilation {
  jsonBytes(value, MAX_ROLE_RECORD_BYTES);
  fields(value, 'accumulator,binding,level,nextRoom,plan,schema');
  const state = value as WorldRoleCompilation;
  check(state.schema === 1 && state.level === floor.level && same(state.binding, binding), 'stale or invalid room role binding');
  check(integer(state.nextRoom) && state.nextRoom <= binding.roomCount, 'invalid room role cursor');
  const a = state.accumulator, seed = floor.generation.recipe.seed;
  fields(a, 'entryId,entrySeen,exitId,exitSeen,hub,roomCount,seed,specialties');
  check(a.entryId === binding.entryId && a.exitId === binding.exitId && a.seed === seed
    && a.roomCount === moduleChambersInPrefix(floor.generation.recipe, state.nextRoom) && a.entrySeen === (state.nextRoom > 0)
    && a.exitSeen === (roomOrdinal(binding.exitId, binding.roomCount) < state.nextRoom), 'invalid room role counters or scope');
  const candidates = a.roomCount - Number(a.entrySeen) - Number(a.exitSeen);
  check(Array.isArray(a.specialties) && a.specialties.length === Math.min(6, candidates), 'invalid bounded role candidates');
  check(candidates === 0 ? a.hub === null : isObject(a.hub), 'invalid role hub');
  const candidateId = (id: string) => check(id !== binding.entryId && id !== binding.exitId
    && isModuleChamber(floor.generation.recipe, id)
    && roomOrdinal(id, binding.roomCount) < state.nextRoom, 'role candidate outside accepted prefix');
  // Recompute only the retained (at most seven) candidates through the shared planner.
  // This validates ranking/order without a second ranking algorithm or a full-floor replay.
  let retained = createModuleRoleAccumulator({ entryId: binding.entryId, exitId: binding.exitId, seed });
  if (a.hub) {
    fields(a.hub, 'degree,id'); candidateId(a.hub.id);
    check(integer(a.hub.degree, 1) && a.hub.degree <= 4, 'invalid role hub degree');
    retained = accumulateModuleRole(retained, a.hub);
  }
  for (const candidate of a.specialties) {
    fields(candidate, 'id,rank'); candidateId(candidate.id);
    if (candidate.id !== a.hub?.id) retained = accumulateModuleRole(retained, { id: candidate.id, degree: 0 });
  }
  check(same(retained.specialties, a.specialties)
    && (candidates > 6 || !a.hub || a.specialties.some(candidate => candidate.id === a.hub!.id)), 'corrupt room role accumulator');
  if (state.nextRoom === binding.roomCount) {
    check(same(state.plan, finalizeModuleRolePlan(a)), 'invalid completed room role plan');
  } else check(state.plan === null, 'premature room role plan');
  return state;
}

async function roomDegree(pages: WorldRead, floor: WorldFloor, id: string): Promise<number> {
  const room = await loadWorldRoom(pages, floor.level, id), { spec, distance } = room.space;
  check(spec.kind === (isModuleChamber(floor.generation.recipe, id) ? 'room' : 'passage') && spec.seed === keyedSeed(floor.generation.recipe.seed, id)
    && (id === 'entry' ? distance === 0 : integer(distance, 1) && distance < floor.generation.rooms), 'invalid role room binding');
  check(room.ports.pending.length === 0 && room.connections.length >= 1 && room.connections.length <= 4,
    'invalid completed room connection degree');
  // A room boundary contributes one graph edge even when it leads through a passage.
  const joins = new Set<string>();
  for (const link of room.connections) {
    const match = /^socket-(0|[1-9]\d*):(door|entrance|exit)$/.exec(link.id);
    check(match && roomOrdinal(`socket-${match[1]}:room`, floor.generation.rooms) > 0
      && !joins.has(match[1]), 'invalid room degree connection identity');
    joins.add(match[1]);
  }
  return room.connections.length;
}

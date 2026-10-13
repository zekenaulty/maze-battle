import { createGuildContract } from '../../../domain/guild/contractFactory';
import { resolveModuleRoomRole } from '../../../domain/maze/moduleRolePlan';
import type { CanonicalPages } from '../pages';
import { check, integer, validId } from '../validation';
import { fields } from '../roster/codec';
import { fresh, json, levelKey, same } from '../world/records';
import { loadWorldRoleCompilation } from '../world/roles';
import { loadWorldRoom } from '../world/residency';
import { requireWorldFloorQuality } from '../world/quality';
import type { WorldRead } from '../world/types';
import { chestKey, contentKey, roomContentKey, saveChest, saveContract } from './records';
import type { ContentPreparation, RoomContent } from './types';

export const MAX_CONTENT_ROOMS_PER_ADVANCE = 2;
const key = (level: number) => `${levelKey(level)}/content`;
const roomIdAt = (n: number) => n === 0 ? 'entry' : `socket-${n - 1}:room`;

async function context(pages: WorldRead, level: number) {
  await requireWorldFloorQuality(pages, level);
  const roles = await loadWorldRoleCompilation(pages, level);
  check(roles.plan, 'content requires prepared room roles');
  return { binding: roles.binding, plan: roles.plan };
}
function validate(value: unknown, level: number, binding: ContentPreparation['binding']): ContentPreparation {
  const row = fields(value, 'schema level binding nextRoom lastRoomRecordId');
  check(row.schema === 1 && row.level === level && same(row.binding, binding), 'stale room content binding');
  check(integer(row.nextRoom) && row.nextRoom <= binding.roomCount, 'invalid room content cursor');
  check(row.nextRoom === 0 ? row.lastRoomRecordId === null : validId(row.lastRoomRecordId), 'invalid content progress witness');
  return value as ContentPreparation;
}
export async function beginWorldContent(pages: CanonicalPages, level: number) {
  const { binding } = await context(pages, level), row = await pages.get('world', key(level));
  if (row) return loadWorldContent(pages, level);
  check(!await pages.get('world', roomContentKey(level, 'entry')), 'missing established content preparation');
  const state: ContentPreparation = { schema: 1, level, binding, nextRoom: 0, lastRoomRecordId: null };
  await pages.set('world', key(level), json(state)); return state;
}
export async function loadWorldContent(pages: WorldRead, level: number) {
  const { binding } = await context(pages, level), row = await pages.get('world', key(level));
  check(row, 'room content has not begun');
  const state = validate(row.value, level, binding);
  if (state.nextRoom > 0) {
    const last = await pages.get('world', roomContentKey(level, roomIdAt(state.nextRoom - 1)));
    check(last && last.id === state.lastRoomRecordId, 'missing or changed content progress witness');
  }
  return state;
}
export async function requireWorldContent(pages: WorldRead, level: number) {
  const state = await loadWorldContent(pages, level);
  check(state.nextRoom === state.binding.roomCount, 'room content is not ready'); return state;
}

/** Engine preparation, not observation. One pinned room page at a time; no historical floors. */
export async function advanceWorldContent(pages: CanonicalPages, level: number, count = MAX_CONTENT_ROOMS_PER_ADVANCE) {
  check(integer(count, 1) && count <= MAX_CONTENT_ROOMS_PER_ADVANCE, 'invalid content advance limit');
  const state = await loadWorldContent(pages, level), { plan } = await context(pages, level);
  const end = Math.min(state.binding.roomCount, state.nextRoom + count);
  let lastRoomRecordId = state.lastRoomRecordId;
  for (let n = state.nextRoom; n < end; n++) {
    const spaceId = roomIdAt(n), role = resolveModuleRoomRole(plan, spaceId);
    const { space, geometry } = await loadWorldRoom(pages, level, spaceId);
    check(space.spec.kind === 'room', 'content target is not a room');
    const center = { row: Math.floor(space.spec.rows / 2), column: Math.floor(space.spec.columns / 2) };
    check(geometry.cells.some(cell => cell.row === center.row && cell.column === center.column), 'room center is not walkable');
    const chestId = role.kind === 'treasure' ? `chest-${level}-${spaceId}` : null;
    const contract = role.tags.includes('questRelevant') && role.kind !== 'start' && role.kind !== 'hub'
      ? createGuildContract({ floor: level, originRoomId: plan.hubId, target: { id: spaceId, ...role } }) : null;
    const content: RoomContent = { schema: 1, level, spaceId, chestId, contractId: contract?.id ?? null };
    await fresh(pages, roomContentKey(level, spaceId), content);
    lastRoomRecordId = (await pages.get('world', roomContentKey(level, spaceId)))!.id;
    if (chestId) {
      check(!await pages.get('world', chestKey(level, chestId)), 'chest already exists');
      await saveChest(pages, { schema: 1, spaceId, chest: { id: chestId, level, position: center, opened: false } });
    }
    if (contract) {
      check(!await pages.get('world', contentKey('contract', contract.id)) && !await pages.get('world', contentKey('quest', contract.id)), 'contract already exists');
      await saveContract(pages, { schema: 1, contract, accepted: false });
    }
  }
  if (state.nextRoom === end) return state;
  const next = { ...state, nextRoom: end, lastRoomRecordId }; await pages.set('world', key(level), json(next)); return next;
}

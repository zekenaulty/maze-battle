import { integer, validAddress } from '../../domain/agentic/knowledge/shared';
import type { RpgAddress, RpgRememberedCell } from '../../domain/agentic/knowledge/types';
import { cellMemoryKey, memberMemoryKey, membersMemoryPrefix, roomMemoryKey, roomsMemoryPrefix } from './keys';
import { queryRpgMemory } from './query';
import { requireMemory, type MemoryPageRequest, type MemoryValue, type MemoryWork } from './types';

export function readRpgCells(slotId: string, addresses: readonly RpgAddress[], snapshotId?: string, work: MemoryWork = {}) {
  requireMemory(Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 64 && addresses.every(validAddress));
  const targets = structuredClone(addresses);
  return queryRpgMemory(slotId, snapshotId, work, async ({ tree, cell }) => {
    const cells: RpgRememberedCell[] = [], unknown: RpgAddress[] = [];
    for (const address of targets) {
      const fact = await cell(await tree.get(cellMemoryKey(address)), address);
      if (fact) cells.push(fact); else unknown.push(address);
    }
    return { cells, unknown };
  });
}

function pageBudget(input: MemoryPageRequest, prefix: string) {
  const { snapshotId, after, limit = 16 } = structuredClone(input);
  requireMemory(integer(limit, 1, 32) && (after === undefined || typeof after === 'string' && after.length <= 2048
    && after.startsWith(prefix) && snapshotId !== undefined));
  return { snapshotId, after, limit };
}

export function readRpgRoom(slotId: string, floor: number, roomId: string, input: MemoryPageRequest = {}, work: MemoryWork = {}) {
  const prefix = membersMemoryPrefix(floor, roomId), { snapshotId, after, limit } = pageBudget(input, prefix);
  return queryRpgMemory(slotId, snapshotId, work, async ({ tree, cell }) => {
    const meta = await tree.get(roomMemoryKey(floor, roomId)) as MemoryValue | undefined;
    if (!meta) return { roomId, floor, rememberedCellCount: 0, cells: [] as RpgRememberedCell[], next: undefined as string | undefined };
    requireMemory(meta.kind === 'room' && meta.roomId === roomId && meta.floor === floor && integer(meta.count, 1));
    const page = await tree.scan(prefix, after, limit), cells: RpgRememberedCell[] = [];
    for (const entry of page.entries) {
      const member = entry.value as MemoryValue;
      requireMemory(member?.kind === 'member' && validAddress(member.address) && member.address.floor === floor && memberMemoryKey(member.address, roomId) === entry.key);
      const fact = await cell(await tree.get(cellMemoryKey(member.address)), member.address);
      requireMemory(fact && fact.roomIds.includes(roomId));
      cells.push(fact);
    }
    requireMemory(meta.count >= cells.length && (after !== undefined || page.next !== undefined || meta.count === cells.length));
    return { roomId, floor, rememberedCellCount: meta.count, cells, next: page.next };
  });
}

export function readRpgRooms(slotId: string, floor: number, input: MemoryPageRequest = {}, work: MemoryWork = {}) {
  const prefix = roomsMemoryPrefix(floor), { snapshotId, after, limit } = pageBudget(input, prefix);
  return queryRpgMemory(slotId, snapshotId, work, async ({ tree }) => {
    const page = await tree.scan(prefix, after, limit);
    const rooms = page.entries.map(({ key, value }) => {
      const meta = value as MemoryValue;
      requireMemory(meta?.kind === 'room' && meta.floor === floor && integer(meta.count, 1) && roomMemoryKey(floor, meta.roomId) === key);
      return { id: meta.roomId, rememberedCellCount: meta.count };
    });
    return { floor, rooms, next: page.next };
  });
}

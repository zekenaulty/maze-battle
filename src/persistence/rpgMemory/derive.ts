import { mergeRpgCell } from '../../domain/agentic/knowledge/mergeCell';
import { integer, sourceOf } from '../../domain/agentic/knowledge/shared';
import type { RpgObservationNode } from '../observationTypes';
import type { ObservationReader } from '../observationNodes';
import { MemoryTree } from './tree';
import { cellMemoryKey, memberMemoryKey, roomMemoryKey } from './keys';
import { memoryWitnesses } from './witnesses';
import { requireMemory, type MemoryValue } from './types';

async function changeRoomCount(tree: MemoryTree, floor: number, roomId: string, delta: number) {
  const key = roomMemoryKey(floor, roomId), previous = await tree.get(key) as MemoryValue | undefined;
  requireMemory(!previous || previous.kind === 'room' && previous.floor === floor && previous.roomId === roomId && integer(previous.count, 1));
  const count = (previous?.kind === 'room' ? previous.count : 0) + delta;
  requireMemory(integer(count, 0));
  if (!count) await tree.delete(key);
  else await tree.set(key, { kind: 'room', floor, roomId, count } satisfies MemoryValue);
}

/** Reuses the resident projection's cell reducer; only validated archived evidence is input. */
export async function deriveRpgMemory(tree: MemoryTree, reader: ObservationReader, node: RpgObservationNode, cellCount: number) {
  const witness = memoryWitnesses(reader, node), source = sourceOf(node.observation);
  for (const cell of node.observation.cells) {
    const key = cellMemoryKey(cell.address), previous = await witness(await tree.get(key), cell.address);
    if (!previous) cellCount++;
    requireMemory(integer(cellCount, 1));
    const fact = mergeRpgCell(previous, cell, source);
    await tree.set(key, { kind: 'cell', fact } satisfies MemoryValue);
    for (const id of previous?.roomIds ?? []) {
      if (cell.roomIds.includes(id)) continue;
      await tree.delete(memberMemoryKey(cell.address, id));
      await changeRoomCount(tree, cell.address.floor, id, -1);
    }
    for (const id of cell.roomIds) {
      if (previous?.roomIds.includes(id)) continue;
      await tree.set(memberMemoryKey(cell.address, id), { kind: 'member', address: cell.address } satisfies MemoryValue);
      await changeRoomCount(tree, cell.address.floor, id, 1);
    }
  }
  return cellCount;
}

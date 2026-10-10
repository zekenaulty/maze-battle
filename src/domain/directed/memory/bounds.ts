import type { CellAddress } from '../../expedition/types';
import { DIRECTED_LIMITS, type KnowledgeProjection } from '../types';
import type { MemoryBounds, MemoryDestination, MemoryIdentity } from './types';

export const DEFAULT_MEMORY_BOUNDS: Readonly<MemoryBounds> = Object.freeze({
  bytes: 16_384, cells: 24, rooms: 6, facts: 32, connections: 12, nearHops: 1, searchCells: DIRECTED_LIMITS.cells,
});
export const MAX_MEMORY_BOUNDS: Readonly<MemoryBounds> = Object.freeze({
  bytes: DIRECTED_LIMITS.bytes, cells: 128, rooms: 16, facts: 128, connections: 64, nearHops: 4,
  searchCells: DIRECTED_LIMITS.cells,
});

export function memoryBounds(input: Partial<MemoryBounds> = {}): MemoryBounds {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !Object.hasOwn(DEFAULT_MEMORY_BOUNDS, key))) {
    throw new Error('Invalid memory bounds.');
  }
  const result = { ...DEFAULT_MEMORY_BOUNDS, ...input };
  for (const key of Object.keys(result) as (keyof MemoryBounds)[]) {
    const minimum = key === 'nearHops' ? 0 : 1;
    if (!Number.isSafeInteger(result[key]) || result[key] < minimum || result[key] > MAX_MEMORY_BOUNDS[key]) {
      throw new Error(`Invalid memory bound: ${key}.`);
    }
  }
  return result;
}

export function assertMemoryId(id: string): void {
  if (typeof id !== 'string' || !id.length) throw new Error('Invalid memory identity.');
}
export function assertMemoryAddress(position: CellAddress): void {
  if (!position || typeof position !== 'object') throw new Error('Invalid memory position.');
  assertMemoryId(position.spaceId);
  if (![position.row, position.column].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Invalid memory position.');
  }
}
export function assertMemoryInput(knowledge: KnowledgeProjection, position: CellAddress,
  identity: MemoryIdentity, bounds: MemoryBounds): void {
  assertMemoryAddress(position);
  if (!identity) throw new Error('Invalid memory identity.');
  for (const id of [identity.worldId, identity.observerId, identity.floorId]) assertMemoryId(id);
  if (knowledge.worldId !== identity.worldId || knowledge.observerId !== identity.observerId) {
    throw new Error('Memory world/observer mismatch.');
  }
  if (!Number.isSafeInteger(knowledge.revision) || knowledge.revision < 0) throw new Error('Invalid memory revision.');
  if (Object.keys(knowledge.cells).length > bounds.searchCells
    || Object.keys(knowledge.spaces).length > DIRECTED_LIMITS.cells) throw new Error('Memory search budget exceeded.');
}
export function assertMemoryDestination(target: MemoryDestination): void {
  if (!target || typeof target !== 'object') throw new Error('Invalid memory destination.');
  if (target.kind === 'cell') assertMemoryAddress(target.address);
  else if (target.kind === 'room') assertMemoryId(target.roomId);
  else if (target.kind === 'feature') assertMemoryId(target.featureId);
  else throw new Error('Invalid memory destination.');
}

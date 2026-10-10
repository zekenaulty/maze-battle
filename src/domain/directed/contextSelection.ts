import type { MemoryBounds, MemoryDestination } from './memory';
import { memoryBounds } from './memory/bounds';

export type MemoryContextSelection = { kind: 'overview'; bounds?: Partial<MemoryBounds> }
  | { kind: 'destination'; target: MemoryDestination; bounds?: Partial<MemoryBounds> };

export function normalizeMemorySelection(selection: MemoryContextSelection): MemoryContextSelection {
  return selection.kind === 'overview' ? { kind: 'overview', bounds: memoryBounds(selection.bounds) }
    : { kind: 'destination', target: structuredClone(selection.target), bounds: memoryBounds(selection.bounds) };
}

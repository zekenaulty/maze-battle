import type { RpgAddress, RpgRememberedCell } from '../../domain/agentic/knowledge/types';

export interface RpgMemoryHead {
  id: string;
  gameId: string;
  depth: number;
  root: string | null;
  cellCount: number;
  witness: string;
}
export type MemoryValue = { kind: 'cell'; fact: RpgRememberedCell }
  | { kind: 'member'; address: RpgAddress }
  | { kind: 'room'; floor: number; roomId: string; count: number };
export interface MemoryWork { maxReads?: number; maxWrites?: number; signal?: AbortSignal }
export interface MemoryPageRequest { snapshotId?: string; after?: string; limit?: number }
export type UnpreparedMemory = { status: 'unprepared'; reason: 'no-observation' | 'index-incomplete'; snapshotId?: string };

export function requireMemory(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or unavailable RPG memory. Source evidence was preserved.');
}

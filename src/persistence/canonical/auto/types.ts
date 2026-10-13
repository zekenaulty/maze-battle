import type { WorldPosition } from '../world/types';
import type { KnownStep } from '../knowledge/navigation';
import type { ObservationRef } from '../knowledge/types';

export const AUTO_LIMITS = Object.freeze({ cells: 512, steps: 64, exits: 4, guild: 16, ancestors: 8 });
export type AutoObjective = { id: string; roomId: string; kind: 'quest' | 'exit' };
export interface AutoRoute { source: ObservationRef; target: WorldPosition; purpose: 'objective' | 'explore' | 'backtrack' | 'exit'; steps: KnownStep[] }
export interface RoomSearch { objectiveId: string; fromId: string; seekId: string; childId: string | null }
export interface AutoState {
  schema: 1; level: number; runId: string; rootId: string; lastPosition: WorldPosition; lastRevision: number;
  status: 'running' | 'town' | 'blocked'; reason: string; objective: AutoObjective | null;
  route: AutoRoute | null; search: RoomSearch | null; descent: WorldPosition | null;
  /** Exhausted earned exploration for this run, not combat or authoritative floor completion. */
  completed: boolean; townServiced: boolean;
}
export interface AutoRoom {
  schema: 1; level: number; spaceId: string; runId: string; depth: number;
  parent: KnownStep | null; completed: string[]; closed: boolean;
}
export class AutoBlocked extends Error {
  constructor(message: string) { super(message); this.name = 'AutoBlocked'; }
}

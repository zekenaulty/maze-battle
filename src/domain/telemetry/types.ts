import type { AutopilotState, GameMode, GridPosition } from '../types';

export type PlaySource = 'manual' | 'auto' | 'system';

export const METRIC_SEMANTICS = {
  goldGained: 'Sum of positive wallet deltas per action; simultaneous buys and sales are netted.',
  goldSpent: 'Sum of negative wallet deltas per action; simultaneous buys and sales are netted.',
  damageTaken: 'Sum of net HP losses per actor per action, not gross incoming damage.',
  healing: 'Sum of net HP gains per actor per action, including level-ups and rest, not gross healing.',
  noProgress: 'Actions without a counted metric change; includes expected cooldown waits and settings changes.',
} as const;

export interface TransitionContext {
  action: string;
  source: PlaySource;
  elapsedMs?: number;
}

export interface PlayCounters {
  actions: number;
  moves: number;
  revisits: number;
  noProgress: number;
  blocked: number;
  descents: number;
  prematureDescents: number;
  chests: number;
  quests: number;
  battlesWon: number;
  battlesLost: number;
  kills: number;
  itemsAdded: number;
  itemsRemoved: number;
  goldGained: number;
  goldSpent: number;
  portalsUsed: number;
  damageTaken: number;
  healing: number;
  totalDecisionMs: number;
  maxDecisionMs: number;
}

export interface PlayEvent extends TransitionContext {
  sequence: number;
  at: string;
  floor: number;
  mode: GameMode;
  phase?: AutopilotState['phase'];
  position: GridPosition;
  objective?: string;
  reason?: string;
  progress: boolean;
  changes: Partial<PlayCounters>;
}

export interface PlayTelemetry {
  version: 1;
  gameId: string;
  startedAt: string;
  updatedAt: string;
  sequence: number;
  counters: PlayCounters;
  sources: Record<PlaySource, number>;
  actions: Record<string, number>;
  events: PlayEvent[];
}

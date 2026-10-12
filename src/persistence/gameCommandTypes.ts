import type { GameCommand, GameCommandOutcome } from '../domain/gameCommands';
import type { GridPosition } from '../domain/types';
import type { SaveControl } from './saveControl';

/** Original internal attempt; a future Agentica binding retains its SDK envelope separately. */
export interface GameCommandRequest {
  attemptId: string;
  gameId: string;
  floor: number;
  position: GridPosition;
  control: SaveControl;
  deadlineAt: number;
  command: GameCommand;
}

export interface GameCommandReceipt {
  version: 1;
  attemptId: string;
  fingerprint: string;
  gameId: string;
  beforeRevision: number;
  afterRevision: number;
  committedAt: number;
  observationHead?: string;
  outcome: GameCommandOutcome | { status: 'not-applied'; reason: 'conflict' | 'expired' | 'settled' };
}

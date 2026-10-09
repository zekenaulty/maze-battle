import type { ExpeditionActionRequest, ExpeditionActionResult } from '../domain/expedition/protocol';
import type { CellAddress, ExpeditionCheckpoint, ExpeditionPlan } from '../domain/expedition/types';

export const MAX_DURABLE_ACTIONS = 4096;
export interface ExpeditionOwner { sessionId: string; epoch: number }
export interface DurableExpeditionSession extends ExpeditionOwner {
  version: 1;
  worldId: string;
  floorId: string;
  scopeId: string;
  maxActions: number;
  receiptCount: number;
  pendingActionId: string | null;
}

/** Only local checkpoint effects, not proof of any remote/provider side effect. */
export interface ExpeditionActionEffect {
  from: CellAddress;
  to: CellAddress;
  openedChestIds: string[];
  moves: number;
  beforePhase: ExpeditionCheckpoint['phase'];
  afterPhase: ExpeditionCheckpoint['phase'];
}
export interface DurableExpeditionReceipt {
  version: 1;
  request: ExpeditionActionRequest;
  signature: string;
  result: ExpeditionActionResult;
  effect?: ExpeditionActionEffect;
}
export interface ExpeditionActionOutcome {
  checkpoint: ExpeditionCheckpoint;
  result: ExpeditionActionResult;
}
export type ExpeditionActionReservation =
  | { status: 'reserved'; receipt: DurableExpeditionReceipt; plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint }
  | { status: 'existing'; receipt: DurableExpeditionReceipt };

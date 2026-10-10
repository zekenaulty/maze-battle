import type { CellAddress } from '../expedition/types';
import type { InspectionDirection } from './perceptionTypes';
import type { DestinationOperation } from './destinationExecution';
import type { DirectedActor, DirectedWorld, KnowledgeProjection, ObservationReceipt, WorldEvent } from './types';

export type NavigationTarget =
  | { kind: 'cell'; address: CellAddress; arrival: 'occupy' }
  | { kind: 'feature'; featureId: string; arrival: 'adjacent' };
export type NavigationOperation = DestinationOperation<NavigationTarget>;
export interface DirectedSession {
  version: 'directed-v1'; revision: number; epoch: number; owner?: string;
  world: DirectedWorld; actor: DirectedActor; knowledge: KnowledgeProjection;
  operation?: NavigationOperation;
}
export type DirectedCommand =
  | { type: 'navigate'; operationId: string; target: NavigationTarget }
  | { type: 'step'; operationId: string; sequence: number }
  | { type: 'cancel'; operationId: string }
  | { type: 'look' }
  | { type: 'inspect'; direction: InspectionDirection }
  | { type: 'retry-crossing'; to: CellAddress }
  | { type: 'interact'; featureId: string };
export interface DirectedRequest {
  attemptId: string; owner: string; epoch: number; expectedRevision: number; command: DirectedCommand;
}
export interface DirectedOutcome {
  status: 'applied' | 'refused'; reason: string;
  operation?: NavigationOperation;
  position: CellAddress;
}
export interface DirectedTransition {
  session: DirectedSession; outcome: DirectedOutcome;
  observations: ObservationReceipt[]; events: WorldEvent[];
}
export interface DirectedReceipt {
  request: DirectedRequest; result: DirectedOutcome; revision: number;
  observationIds: string[]; eventIds: string[];
}

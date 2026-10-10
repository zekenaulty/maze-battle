import type { StreamActionReceipt, StreamActionRequest, StreamActionResult, StreamCheckpoint, StreamCommand, StreamControl, StreamKnowledgePage, StreamObservation } from '../../../domain/expedition/streaming/types';

export const PLANNING_PROTOCOL = 'maze-planning/1' as const;
export interface PlanningBinding {
  sessionId: string; epoch: number; runId: string; objectiveId: string; actorId: string;
  worldId: string; floorId: string; scopeId: string;
}
export interface PlanningLimits { actions: number; elapsedMs: number; frameBytes: number }
export const DEFAULT_PLANNING_LIMITS: PlanningLimits = { actions: 128, elapsedMs: 60_000, frameBytes: 131_072 };

/** Internal port. scopeId here is private; projection substitutes the opaque binding. */
export interface PlanningState {
  checkpoint: StreamCheckpoint; knowledge: StreamKnowledgePage;
  observation: StreamObservation; control: StreamControl | undefined;
}
export interface PlanningHost {
  read(): Promise<PlanningState>;
  /** Fence owner and both revisions atomically. Rejection/unavailable requires exact receipt reconciliation. */
  execute(request: StreamActionRequest): Promise<StreamActionResult>;
  /** Return only the original committed receipt matching every request field. */
  lookup(request: StreamActionRequest): Promise<StreamActionReceipt | undefined>;
  /** Reclaim the bound owner only; never replace a newer owner. */
  release(): Promise<void>;
}
export interface PlanningFrame {
  observationId: string;
  checkpoint: StreamCheckpoint;
  observation: StreamObservation;
  knowledge: StreamKnowledgePage;
}
export interface Envelope { protocol: typeof PLANNING_PROTOCOL; binding: PlanningBinding }
export interface PlanningAction extends Envelope {
  type: 'action.request' | 'action.query'; actionId: string;
  expectedRevision: number; expectedTopologyRevision: number; command: StreamCommand;
}
export interface PlanningProgress extends Envelope {
  type: 'progress'; sequence: number; stage: 'planning' | 'executing' | 'evaluating'; summary: string;
}
export interface PlanningOutcome extends Envelope {
  type: 'outcome'; status: 'complete' | 'budget' | 'blocked' | 'cancelled';
  resultActionId?: string; summary: string;
}
export type ServiceMessage = PlanningAction | PlanningProgress | PlanningOutcome | (Envelope & { type: 'observe' });
export type HostBody =
  | { type: 'start'; limits: PlanningLimits; objective: 'explore-collect-return'; capabilities: readonly string[]; frame: PlanningFrame }
  | { type: 'observation'; frame: PlanningFrame }
  | { type: 'action.result'; result: StreamActionResult; frame?: PlanningFrame }
  | { type: 'action.unresolved'; actionId: string; reason: string }
  | { type: 'progress.ack'; sequence: number; dropped: number }
  | { type: 'outcome'; status: PlanningOutcome['status']; resultActionId?: string; summary: string }
  | { type: 'error'; reason: string };
export type HostMessage = Envelope & HostBody;

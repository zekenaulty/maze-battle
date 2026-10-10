import type { StreamControl } from '../../domain/expedition/streaming/types';

/** Mirrors Agentica HostProtocol.cs v1; this is not the temporary local harness envelope. */
export interface AgenticaObservation {
  observationId: string; revision: number; observedAt: string;
  data: Record<string, unknown>; facts?: unknown[];
}
export interface AgenticaAction {
  actionId: string; runId: string; runnerRunId: string; stepId: string;
  sessionId: string; sessionEpoch: string; capabilityId: string; manifestHash: string;
  arguments: Record<string, unknown>; expectedRevision: number; deadlineAt: string;
}
export interface AgenticaResult {
  actionId: string; sessionId: string; sessionEpoch: string;
  disposition: 'applied' | 'refused' | 'conflict' | 'unavailable' | 'unresolved';
  beforeRevision: number; afterRevision: number; evidenceId: string; summary: string;
  observation?: AgenticaObservation;
  completion?: { objectiveId: string; evidenceId: string; summary: string };
  operation?: { operationId: string; summary: string; usage?: Record<string, unknown> };
}
export interface AgenticaActionRecord {
  fingerprint: string; status: 'pending' | 'unresolved' | 'completed'; result?: AgenticaResult;
}
export interface AgenticaCapability {
  durableHandoff?: boolean;
  id: string; name: string; description: string; kind: 'query' | 'action'; effect: 'readOnly' | 'writesLocalState';
  inputSchema: { fields: { name: string; type: 'string' | 'integer'; required: boolean; description?: string;
    allowedValues?: string[]; minimum?: number; maximum?: number }[]; allowAdditionalProperties: false };
}
export type AgenticaObjective = 'first-chest' | 'explore-collect-return';
/** Browser-owned binding retained before admitting any action for the service-created run. */
export interface AgenticaGameBinding {
  protocolVersion: 1; hostId: 'maze-battle'; sessionId: string; sessionEpoch: string;
  scopeId: string; perspectiveId: 'party'; worldId: string; floorId: string;
  objectiveId: string; objective: AgenticaObjective; runId: string; manifestHash: string; control: StreamControl;
}
export interface AgenticaStart {
  protocolVersion: 1; hostId: 'maze-battle'; sessionId: string; sessionEpoch: string;
  scopeId: string; perspectiveId: 'party'; objectiveId: string; objective: string;
  observation: AgenticaObservation; capabilities: AgenticaCapability[];
  provider: { provider: 'fixture'; model?: string; contextWindowTokens: number; maxOutputTokens: number };
  limits: { maxSteps: number; maxRefinements: number; maxPlanContinuations: number; timeoutSeconds: number; actionTimeoutSeconds: number };
}

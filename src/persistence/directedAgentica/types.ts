import type { AgenticaAction, AgenticaActionRecord, AgenticaObservation } from '../../services/agentica/contracts';
import type { DirectedAgenticaBinding } from '../../services/agentica/directed/contracts';

export interface DirectedHostAction { version: 1; operationId: string; record: AgenticaActionRecord }
export interface DirectedHostOperation {
  version: 1; operationId: string; action: AgenticaAction; binding: DirectedAgenticaBinding;
  activeEpoch: string; sequence: number; acknowledged: number;
}
export interface DirectedHostEvent {
  hostId: 'maze-battle'; sessionId: string; sessionEpoch: string; actionId: string; operationId: string;
  sequence: number; eventId: string; kind: 'progress' | 'transfer' | 'decision' | 'completed' | 'blocked' | 'cancelled';
  observation: AgenticaObservation; summary: string; usage: Record<string, unknown>;
  completion?: { objectiveId: string; evidenceId: string; summary: string }; nextSessionEpoch?: string;
}

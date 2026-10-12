import type { AgenticaAction, AgenticaActionRecord } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import type { HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';

export interface RpgHostAction {
  key: string; version: 1; operationId: string; record: AgenticaActionRecord; witness: string;
}
export interface RpgHostOperation {
  operationId: string; version: 1; action: AgenticaAction; binding: RpgAgenticaBinding;
  activeEpoch: string; sequence: number; acknowledged: number; witness: string;
}
export interface RpgHostEvent {
  key: string; event: HostOperationEvent; witness: string;
}
export interface RpgHostAdvance {
  attemptId: string; fingerprint: string; eventKey?: string; waitingForAck: boolean; witness: string;
}

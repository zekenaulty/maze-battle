import type { AgenticaAction, AgenticaResult } from '../contracts';
import type { recoverPregrantAction } from './pendingRecovery';

export interface PendingActionDescriptor {
  actionId: string;
  requestHash: string;
  capabilityHash: string;
  disposition: string | null;
  recoveryRetention: string | null;
}
export interface PendingRecoveryRun {
  hostId: string; sessionId: string; sessionEpoch: string; runId: string;
}
export interface PendingActionPage extends PendingRecoveryRun {
  items: PendingActionDescriptor[];
  nextAfterActionId: string | null;
  rootClear: 'unknown'; sessionClear: 'unknown';
}
/** Pass this inspected selection directly to reconciliation; it is never execution authority. */
export interface PendingActionSelection {
  status: 'action-inspected';
  descriptor: PendingActionDescriptor;
  action: AgenticaAction;
  result: AgenticaResult;
  rootClear: 'unknown'; sessionClear: 'unknown';
}
export interface GamePendingRecovery {
  list(afterActionId?: string | null): Promise<PendingActionPage>;
  inspect(descriptor: PendingActionDescriptor): Promise<PendingActionSelection>;
  reconcile(selection: PendingActionSelection): ReturnType<typeof recoverPregrantAction>;
  close(): void;
}

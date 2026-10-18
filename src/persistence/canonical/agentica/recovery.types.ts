import type { CanonicalOperation, OwnerFence } from '../types';
import type { OperationBinding } from './operation.types';
import type { ProtocolRef } from './types';

/** A local locator, not execution authority or proof that remote custody is clear. */
export interface RecoveryCandidate {
  operationId: string;
  original: ProtocolRef;
  binding: OperationBinding;
}
export interface RecoveryAllocation {
  operationId: string;
  state: CanonicalOperation['state'];
  navigation: RecoveryCandidate | null;
}
export interface RecoveryInventory {
  fence: OwnerFence;
  active: { launchId: string; guardId: string; state: CanonicalOperation['state']; grant: ProtocolRef | null } | null;
  selected: { reference: ProtocolRef; binding: OperationBinding; predecessor: RecoveryCandidate | null } | null;
  claimed: RecoveryCandidate | null;
  allocations: RecoveryAllocation[];
  pendingRemoteActions: 'unknown';
  sessionClear: 'unknown';
}

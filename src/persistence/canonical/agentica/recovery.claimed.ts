import { fields } from '../roster/codec';
import { check } from '../validation';
import { loadDecisionClaim } from './decision.claim';
import { claimedParentKey, claimedParentValue } from './decision.claim.locator';
import { captureOperationBinding } from './operation.binding';
import type { OperationRead } from './operation.types';
import type { ProtocolRef } from './types';
import type { RecoveryCandidate } from './recovery.types';
import { equal, restoreRetainedAction, snapshotReference } from './validation';

/** One active-root locator, validated against immutable evidence; never a grant or history search. */
export async function readClaimedParent(pages: OperationRead, active: { id: string; sourceAttemptId: string }): Promise<RecoveryCandidate | null> {
  const pointer = await pages.get('execution', claimedParentKey(active.id));
  if (!pointer) return null;
  const value = fields(pointer.value, 'schema kind launchId sourceAttemptId original binding');
  const original = snapshotReference(value.original as unknown as ProtocolRef);
  const binding = captureOperationBinding(value.binding as unknown as RecoveryCandidate['binding']);
  check(pointer.indexes.length === 0 && equal(value, claimedParentValue(active.id, value.sourceAttemptId as string, original, binding)),
    'claimed parent pointer changed');
  const identity = await restoreRetainedAction(pages, original, binding), claim = await loadDecisionClaim(pages, identity);
  check(claim && claim.data.locatorId === pointer.id && claim.row.revision === pointer.revision
    && claim.source.attemptId === value.sourceAttemptId, 'claimed parent claim source changed');
  const bound = claim.decision.terminal.bound;
  check(equal(bound.original.reference, original) && equal(claim.decision.data.binding, binding)
    && bound.launch.binding.launchId === active.id && bound.launch.guard.admissionAttemptId === active.sourceAttemptId,
    'claimed parent original or root changed');
  return { operationId: bound.operation.id, original, binding };
}

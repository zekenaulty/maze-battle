import { readCanonical } from '../read';
import { check } from '../validation';
import { loadEventAcknowledgement, loadOperationEvent } from './event.records';
import { loadOperationConfirmation } from './operation.confirmation';
import type { OperationRead } from './operation.types';
import type { PreparedAction } from './types';
import { snapshotPrepared } from './validation';

export { retainOperationConfirmation } from './operation.confirmation';
export { operationProgressHooks, retainEventAcknowledgement } from './event';
export type { OperationBinding, OperationConfirmation, OperationEvent, EventAcknowledgement } from './operation.types';

/** Bounded discovery only; never runs pending actions, movement, delivery or adoption. */
export async function loadAgenticaOperation(pages: OperationRead, input: PreparedAction) {
  const identity = snapshotPrepared(input), confirmation = await loadOperationConfirmation(pages, identity);
  if (!confirmation) return null;
  const progress = confirmation.bound.progress;
  const event = progress.sequence ? await loadOperationEvent(pages, identity, confirmation, progress.sequence) : null;
  check(!event || event.source.attemptId === progress.sourceAttemptId, 'latest progress lacks its original event');
  const acknowledgement = event ? await loadEventAcknowledgement(pages, identity, confirmation, event) : null;
  return { confirmation: { reference: confirmation.reference, data: confirmation.data }, operation: confirmation.bound.operation, progress,
    event: event ? { reference: event.reference, data: event.data } : null,
    acknowledgement: acknowledgement ? { reference: acknowledgement.reference, data: acknowledgement.data } : null };
}
export function readAgenticaOperation(input: PreparedAction) {
  const identity = snapshotPrepared(input); return readCanonical(pages => loadAgenticaOperation(pages, identity));
}

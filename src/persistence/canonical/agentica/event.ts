import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { launchPages } from './launch.records';
import { loadOperationConfirmation } from './operation.confirmation';
import { operationRequest, writeOperationRecord } from './operation.records';
import { operationEntry } from './operation.wire';
import { eventKey, loadEventAcknowledgement, loadOperationEvent, validateAcknowledgement } from './event.records';
import type { EventAcknowledgement } from './operation.types';
import type { PreparedAction, ProtocolRef, ProtocolWrite } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';

export { operationProgressHooks } from './event.hooks';

/** Ordinary progress delivery evidence, not a funded terminal ACK or a prerequisite for Stop. */
export async function retainEventAcknowledgement(tx: CanonicalWork, input: CanonicalRequest, inputIdentity: PreparedAction,
  inputEvent: ProtocolRef, inputEntry: AgenticaOperationEntry): Promise<ProtocolWrite> {
  const identity = snapshotPrepared(inputIdentity), ref = snapshotReference(inputEvent), entry = operationEntry(inputEntry);
  const request = operationRequest(tx, input, 'agentica.operation.ack', { action: identity.storageKey, event: ref, entry });
  const pages = launchPages(tx);
  const confirmed = await loadOperationConfirmation(pages, identity); check(confirmed && entry.latestEvent, 'missing acknowledged operation event');
  const event = await loadOperationEvent(pages, identity, confirmed, entry.latestEvent.sequence, ref);
  validateAcknowledgement(entry, confirmed, event.data);
  const previous = await loadEventAcknowledgement(pages, identity, confirmed, event);
  if (previous) {
    check(equal(previous.data.entry, entry), 'original acknowledgement changed');
    return { reference: previous.reference, receipt: { reference: { ...previous.reference } } };
  }
  check(event.data.event.sequence === confirmed.bound.progress.sequence && event.source.attemptId === confirmed.bound.progress.sourceAttemptId,
    'acknowledgement is not for current canonical progress');
  const data: EventAcknowledgement = { event: ref, entry };
  return writeOperationRecord(tx, request, eventKey(identity, event.data.event.sequence, true), 'agentica-operation-ack', data);
}

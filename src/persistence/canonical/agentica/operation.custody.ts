import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { launchPages } from './launch.records';
import { assertOperationCustody } from './operation.binding';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationRecord, operationKey, operationRequest, writeOperationRecord } from './operation.records';
import { equivalentOperationWire, operationEntry, validateOperationEntry } from './operation.wire';
import type { OperationCustodyAck, OperationRead } from './operation.types';
import type { PreparedAction, ProtocolRef, ProtocolWrite } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';

type Confirmed = NonNullable<Awaited<ReturnType<typeof loadOperationConfirmation>>>;
function validateCustodyEntry(entry: AgenticaOperationEntry, confirmed: Confirmed) {
  validateOperationEntry(entry, confirmed.bound.launch.binding.start, confirmed.bound.original.original.action, confirmed.bound.result);
  check(equal(entry.usage, confirmed.data.entry.usage) && entry.latestEvent != null
    && equivalentOperationWire(entry.latestEvent, confirmed.data.probe, 'event'), 'service did not acknowledge exact custody probe');
}
/** Historical delivery evidence only; this never authorizes a new owner or revalidates initial publication freshness. */
export async function loadOperationCustodyAck(pages: OperationRead, input: PreparedAction, inputConfirmation: ProtocolRef) {
  const identity = snapshotPrepared(input), ref = snapshotReference(inputConfirmation);
  const confirmed = await loadOperationConfirmation(pages, identity, ref); check(confirmed, 'missing service confirmation');
  const ack = await loadOperationRecord<OperationCustodyAck>(pages, operationKey(identity, 'custody'), 'agentica-operation-custody');
  if (!ack) { check(confirmed.bound.progress.sequence === 0, 'progress lacks custody acknowledgement'); return null; }
  fields(ack.data, 'confirmation entry'); const entry = operationEntry(ack.data.entry);
  check(equal(ack.data.confirmation, ref) && ack.source.operation === 'agentica.operation.custody'
    && equal(ack.source.input, { action: identity.storageKey, confirmation: ref, entry }), 'custody acknowledgement command changed');
  check(ack.source.expected.owner === confirmed.source.expected.owner && ack.source.expected.epoch === confirmed.source.expected.epoch
    && ack.source.expected.revision >= confirmed.row.revision, 'custody acknowledgement source changed');
  validateCustodyEntry(entry, confirmed); return ack;
}

/** Ordinary write, never a prerequisite for funded Stop or terminal ACK. No implicit acceptance of a parked entry. */
export async function retainOperationCustodyAck(tx: CanonicalWork, input: CanonicalRequest, inputIdentity: PreparedAction,
  inputConfirmation: ProtocolRef, inputEntry: AgenticaOperationEntry): Promise<ProtocolWrite> {
  const identity = snapshotPrepared(inputIdentity), ref = snapshotReference(inputConfirmation), entry = operationEntry(inputEntry);
  const request = operationRequest(tx, input, 'agentica.operation.custody', { action: identity.storageKey, confirmation: ref, entry });
  const pages = launchPages(tx), confirmed = await loadOperationConfirmation(pages, identity, ref); check(confirmed, 'missing service confirmation');
  validateCustodyEntry(entry, confirmed);
  const previous = await loadOperationCustodyAck(pages, identity, ref);
  if (previous) {
    check(equal(previous.data.entry, entry), 'original custody acknowledgement changed');
    return { reference: previous.reference, receipt: { reference: { ...previous.reference } } };
  }
  check(confirmed.bound.progress.sequence === 0, 'custody acknowledgement must precede local progress');
  assertOperationCustody(tx.head, confirmed.bound);
  return writeOperationRecord(tx, request, operationKey(identity, 'custody'), 'agentica-operation-custody', { confirmation: ref, entry });
}

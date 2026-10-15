import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { launchPages } from './launch.records';
import { assertOperationCustody, captureOperationBinding, loadOperationBinding } from './operation.binding';
import { loadOperationRecord, operationKey, operationRequest, writeOperationRecord } from './operation.records';
import { operationEntry, validateOperationEntry } from './operation.wire';
import { operationCustodyProbe } from './operation.probe';
import type { OperationBinding, OperationConfirmation, OperationRead } from './operation.types';
import type { PreparedAction, ProtocolRef, ProtocolWrite } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';

export async function loadOperationConfirmation(pages: OperationRead, input: PreparedAction, reference?: ProtocolRef) {
  const identity = snapshotPrepared(input), ref = reference && snapshotReference(reference);
  const record = await loadOperationRecord<OperationConfirmation>(pages, operationKey(identity), 'agentica-operation-confirmation', ref);
  if (!record) return null;
  const data = record.data;
  fields(data, 'binding original result operationId entry probe'); fields(data.binding, 'grant publication');
  const bound = await loadOperationBinding(pages, identity, data.binding), entry = operationEntry(data.entry);
  validateOperationEntry(entry, bound.launch.acceptedStart, identity.action, bound.result);
  check(entry.latestEvent == null && equal(data.original, bound.original.reference) && equal(data.result, bound.original.resultReference)
    && data.operationId === bound.operation.id, 'operation confirmation original changed');
  check(record.source.operation === 'agentica.operation.confirm' && equal(record.source.input,
    { action: identity.storageKey, binding: data.binding, entry }), 'operation confirmation command changed');
  check(record.source.expected.owner === bound.grant.value.data.owner && record.source.expected.epoch === bound.grant.value.data.epoch
    && record.row.revision > bound.result.afterRevision, 'operation confirmation source custody changed');
  check(equal(data.probe, operationCustodyProbe(bound.launch.binding.start.hostId, identity.action, bound.result, record.source.attemptId)),
    'operation custody probe changed');
  return { ...record, bound };
}

/** Retain the service's original parked entry. No local execution, adoption or network call. */
export async function retainOperationConfirmation(tx: CanonicalWork, input: CanonicalRequest, inputIdentity: PreparedAction,
  inputBinding: OperationBinding, inputEntry: AgenticaOperationEntry): Promise<ProtocolWrite> {
  const identity = snapshotPrepared(inputIdentity), binding = captureOperationBinding(inputBinding), entry = operationEntry(inputEntry);
  const request = operationRequest(tx, input, 'agentica.operation.confirm', { action: identity.storageKey, binding, entry });
  const pages = launchPages(tx), previous = await loadOperationConfirmation(pages, identity);
  if (previous) {
    check(equal(previous.data.binding, binding) && equal(previous.data.entry, entry), 'original service confirmation changed');
    return { reference: previous.reference, receipt: { reference: { ...previous.reference } } };
  }
  const bound = await loadOperationBinding(pages, identity, binding);
  validateOperationEntry(entry, bound.launch.acceptedStart, identity.action, bound.result);
  check(entry.latestEvent == null && bound.progress.sequence === 0, 'service confirmation must precede local progress');
  assertOperationCustody(tx.head, bound);
  const data: OperationConfirmation = { binding, original: bound.original.reference, result: bound.original.resultReference!, operationId: bound.operation.id, entry,
    probe: operationCustodyProbe(bound.launch.binding.start.hostId, identity.action, bound.result, request.attemptId) };
  return writeOperationRecord(tx, request, operationKey(identity), 'agentica-operation-confirmation', data);
}

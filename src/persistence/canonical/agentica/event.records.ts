import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { navigationRecordRef } from '../navigation/host';
import { fields } from '../roster/codec';
import { check, integer, jsonBytes } from '../validation';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationRecord, operationKey } from './operation.records';
import { equivalentOperationWire, operationEntry, validateOperationEntry } from './operation.wire';
import { MAX_EVENT_BYTES, type EventAcknowledgement, type OperationEvent, type OperationRead } from './operation.types';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotReference } from './validation';

export type ConfirmedOperation = NonNullable<Awaited<ReturnType<typeof loadOperationConfirmation>>>;
export function eventKey(identity: PreparedAction, sequence: number, ack = false) {
  check(integer(sequence, 1), 'invalid operation event sequence'); return operationKey(identity, `${ack ? 'acks' : 'events'}/${sequence}`);
}
export function validateAcknowledgement(entry: AgenticaOperationEntry, confirmed: ConfirmedOperation, event: OperationEvent) {
  validateOperationEntry(entry, confirmed.bound.launch.binding.start, confirmed.bound.original.original.action, confirmed.bound.result);
  check(equal(entry.usage, confirmed.data.entry.usage) && entry.latestEvent != null
    && equivalentOperationWire(entry.latestEvent, event.event, 'event'), 'service did not acknowledge exact latest event');
}
export async function loadOperationEvent(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation,
  sequence: number, reference?: ProtocolRef) {
  const ref = reference && snapshotReference(reference), key = eventKey(identity, sequence), row = await pages.get('execution', key);
  check(row && row.indexes.length === 0 && (!ref || equal(ref, { key, id: row.id })), 'missing or replaced operation event');
  const value = fields(row.value, 'schema kind sourceAttemptId data'), data = snapshotJson(value.data) as unknown as OperationEvent;
  fields(data, 'confirmation previous event');
  check(value.schema === 1 && value.kind === 'agentica-operation-event' && equal(data.confirmation, confirmed.reference), 'operation event confirmation changed');
  const event = data.event, action = identity.action, start = confirmed.bound.launch.binding.start;
  fields(event, 'hostId sessionId sessionEpoch actionId operationId sequence eventId kind observation summary usage'); jsonBytes(event, MAX_EVENT_BYTES);
  const { receipt, source } = await pages.sourceReceipt(value.sourceAttemptId as string);
  const result = fields(receipt.result, 'operationId status reason sequence steps replans startedAt recordId recordWitness host');
  const host = fields(result.host, 'event');
  check(equal(host.event, navigationRecordRef(row, source.attemptId)) && receipt.afterRevision === row.revision
    && source.operation === 'navigation.advance' && equal(source.input, { operationId: confirmed.data.operationId, sequence: sequence - 1 })
    && result.operationId === confirmed.data.operationId && result.sequence === sequence, 'operation event source changed');
  check(source.expected.owner === confirmed.source.expected.owner && source.expected.epoch === confirmed.source.expected.epoch
    && receipt.beforeRevision >= confirmed.row.revision, 'operation event source custody changed');
  check(event.hostId === start.hostId && event.sessionId === action.sessionId && event.sessionEpoch === action.sessionEpoch
    && event.actionId === action.actionId && event.operationId === confirmed.data.operationId && event.sequence === sequence
    && event.eventId === source.attemptId && event.kind === 'progress' && event.observation.revision === receipt.afterRevision
    && event.observation.observationId === `event-${source.attemptId}`, 'operation event identity changed');
  if (sequence === 1) check(data.previous === null, 'first event has predecessor');
  else {
    const prev = snapshotReference(data.previous!), prior = await pages.get('execution', eventKey(identity, sequence - 1));
    check(prior && equal(prev, { key: prior.key, id: prior.id }), 'operation event predecessor changed');
  }
  return { reference: { key, id: row.id }, data, row, source };
}
export async function loadEventAcknowledgement(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation,
  event: Awaited<ReturnType<typeof loadOperationEvent>>) {
  const ack = await loadOperationRecord<EventAcknowledgement>(pages, eventKey(identity, event.data.event.sequence, true), 'agentica-operation-ack');
  if (!ack) return null;
  fields(ack.data, 'event entry'); const entry = operationEntry(ack.data.entry);
  check(equal(ack.data.event, event.reference) && ack.source.operation === 'agentica.operation.ack'
    && equal(ack.source.input, { action: identity.storageKey, event: event.reference, entry }), 'operation acknowledgement command changed');
  validateAcknowledgement(entry, confirmed, event.data); return ack;
}

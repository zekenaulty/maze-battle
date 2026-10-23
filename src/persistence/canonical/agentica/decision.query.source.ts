import { canonicalJson, type HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { MAX_EVENT_BYTES } from './operation.types';
import type { ProtocolRead, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotReference } from './validation';

export interface DecisionObservationSource { kind: 'progress' | 'transfer' | 'probe'; reference: ProtocolRef }

/** Exact immutable event record and receipt only; never a current transfer tip or operation lookup. */
export async function readDecisionObservation(pages: ProtocolRead, input: DecisionObservationSource, action: string) {
  const anchor = snapshotJson(input), ref = snapshotReference(anchor.reference);
  const prefix = `agentica/operations/${action.slice(-64)}/`;
  check(/^agentica\/actions\/[a-f0-9]{64}$/.test(action), 'invalid historical action');
  const row = await pages.get('execution', ref.key);
  check(row && row.key === ref.key && row.id === ref.id && row.indexes.length === 0, 'historical observation reference changed');
  const value = fields(row.value, 'schema kind sourceAttemptId data');
  const { source, receipt } = await pages.sourceReceipt(value.sourceAttemptId as string);
  check(value.schema === 1 && source.attemptId === value.sourceAttemptId && receipt.afterRevision === row.revision,
    'historical observation revision changed');
  const data = value.data as Record<string, unknown>, result = receipt.result as Record<string, unknown>;
  if (anchor.kind === 'progress') {
    check(ref.key.startsWith(`${prefix}events/`) && /^[1-9][0-9]*$/.test(ref.key.slice(`${prefix}events/`.length))
      && ['agentica-operation-event', 'agentica-interaction-event'].includes(value.kind as string),
    'historical progress identity changed');
    const host = fields(result.host, 'event');
    check(equal(host.event, { key: ref.key, recordId: ref.id, revision: row.revision,
      sourceAttemptId: source.attemptId, recordWitness: canonicalJson(row) })
      && ['navigation.advance', 'interaction.apply'].includes(source.operation), 'historical progress source changed');
  } else if (anchor.kind === 'transfer') {
    check(value.kind === 'agentica-transfer-intent' && ref.key === `${prefix}transfer/${source.attemptId}`
      && source.operation === 'agentica.operation.transfer'
      && equal(result.transferIntent, { ...ref, witness: canonicalJson(row) }), 'historical transfer source changed');
  } else {
    check(anchor.kind === 'probe' && value.kind === 'agentica-operation-confirmation' && ref.key === `${prefix}confirmation`
      && source.operation === 'agentica.operation.confirm'
      && equal(result.agenticaOperation, { ...ref, recordWitness: canonicalJson(row) }), 'historical probe source changed');
  }
  const event = snapshotJson(anchor.kind === 'probe' ? data.probe : data.event) as HostOperationEvent;
  jsonBytes(event, MAX_EVENT_BYTES);
  const eventId = anchor.kind === 'probe' ? `custody-${source.attemptId}` : source.attemptId;
  check(event.eventId === eventId, 'historical observation event changed');
  return { event, source, revision: row.revision };
}

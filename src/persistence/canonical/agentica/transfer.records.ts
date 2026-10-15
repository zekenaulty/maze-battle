import { canonicalJson, type HostOperationEvent, type AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, integer, jsonBytes } from '../validation';
import type { ConfirmedOperation } from './event.records';
import { loadOperationRecord, operationKey, writeOperationRecord } from './operation.records';
import type { OperationRead } from './operation.types';
import { equivalentOperationWire, operationEntry, validateOperationEntry } from './operation.wire';
import { readPublication } from './publication';
import { transferObservation } from './transfer.wire';
import { loadTransferAdoptions } from './transfer.adoption';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotReference } from './validation';

export interface TransferIntent {
  confirmation: ProtocolRef; publication: ProtocolRef; navigationSequence: number;
  previous: HostOperationEvent; event: HostOperationEvent;
}
export interface TransferAuthority {
  intent: ProtocolRef; guardRevision: number; operationRevision: number;
  guardAdoption: string; navigationAdoption: string;
}
export const transferKey = (identity: PreparedAction) => operationKey(identity, 'transfer');
export const transferStageKey = (ref: ProtocolRef, stage: 'ack' | 'authority') => `${ref.key}/${stage}`;

/** One immutable intent and one receipted current pointer, committed together before any HTTP. */
export async function writeTransferIntent(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction, data: TransferIntent) {
  jsonBytes(data, 6 * 1024);
  const key = `${transferKey(identity)}/${request.attemptId}`;
  check(!await tx.pages.get('execution', key), 'transfer intent is immutable');
  const row = await tx.pages.set('execution', key, snapshotJson({ schema: 1, kind: 'agentica-transfer-intent', sourceAttemptId: request.attemptId, data }) as unknown as JsonObject);
  const reference = { key, id: row.id };
  const tip = await tx.pages.set('execution', transferKey(identity), { schema: 1, kind: 'agentica-transfer-tip', sourceAttemptId: request.attemptId, intent: reference });
  const receipt = { transferIntent: { ...reference, witness: canonicalJson(row) }, transferTip: { key: tip.key, id: tip.id, witness: canonicalJson(tip) } };
  jsonBytes(receipt, 12 * 1024); return { reference, receipt };
}

/** Historical validation is deliberately shallow: original confirmation plus this source, never an ancestor walk. */
export async function loadTransferIntent(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation, input: ProtocolRef) {
  const ref = snapshotReference(input), row = await pages.get('execution', ref.key);
  check(row && row.id === ref.id && row.indexes.length === 0, 'missing or replaced transfer intent');
  const value = fields(row.value, 'schema kind sourceAttemptId data');
  const { source, receipt } = await pages.sourceReceipt(value.sourceAttemptId as string);
  const result = fields(receipt.result, 'transferIntent transferTip');
  check(value.schema === 1 && value.kind === 'agentica-transfer-intent' && ref.key === `${transferKey(identity)}/${source.attemptId}`
    && receipt.afterRevision === row.revision && equal(result.transferIntent, { ...ref, witness: canonicalJson(row) }), 'transfer intent source changed');
  const data = snapshotJson(value.data) as unknown as TransferIntent;
  fields(data, 'confirmation publication navigationSequence previous event'); jsonBytes(data, 6 * 1024);
  check(source.operation === 'agentica.operation.transfer' && equal(source.input, { action: identity.storageKey, publication: data.publication })
    && equal(data.confirmation, confirmed.reference) && integer(data.navigationSequence), 'transfer intent command changed');
  const publication = await readPublication(pages, data.publication), e = data.event, previous = data.previous;
  fields(e, 'hostId sessionId sessionEpoch actionId operationId sequence eventId kind observation summary usage nextSessionEpoch');
  check(e.hostId === confirmed.bound.launch.binding.start.hostId && e.sessionId === identity.action.sessionId
    && e.actionId === identity.action.actionId && e.operationId === confirmed.data.operationId && e.kind === 'transfer'
    && e.eventId === source.attemptId && e.sessionEpoch === (previous.nextSessionEpoch ?? previous.sessionEpoch)
    && integer(e.sequence, 2) && e.sequence === previous.sequence + 1 && e.nextSessionEpoch === String(source.expected.epoch)
    && Number(e.nextSessionEpoch) > Number(e.sessionEpoch), 'transfer event identity changed');
  check(publication.owner === source.expected.owner && publication.epoch === source.expected.epoch
    && publication.snapshot.gameId === source.expected.gameId && publication.snapshot.generation === source.expected.generation
    && publication.snapshot.revision <= source.expected.revision
    && equal(e.observation, transferObservation(publication, source.attemptId)) && e.observation.revision >= previous.observation.revision,
  'transfer publication changed');
  return { reference: ref, data, source, row, publication };
}
export async function loadTransfer(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation) {
  const row = await pages.get('execution', transferKey(identity)); if (!row) return null;
  const value = fields(row.value, 'schema kind sourceAttemptId intent');
  const intent = await loadTransferIntent(pages, identity, confirmed, value.intent as unknown as ProtocolRef);
  const { receipt } = await pages.sourceReceipt(value.sourceAttemptId as string), result = fields(receipt.result, 'transferIntent transferTip');
  check(row.indexes.length === 0 && value.schema === 1 && value.kind === 'agentica-transfer-tip' && row.revision === intent.row.revision
    && value.sourceAttemptId === intent.source.attemptId && equal(result.transferTip, { key: row.key, id: row.id, witness: canonicalJson(row) }), 'transfer pointer changed');
  return intent;
}
export type RetainedTransfer = NonNullable<Awaited<ReturnType<typeof loadTransfer>>>;
export function validateTransferAck(entry: AgenticaOperationEntry, confirmed: ConfirmedOperation, transfer: RetainedTransfer) {
  operationEntry(entry);
  validateOperationEntry(entry, confirmed.bound.launch.acceptedStart, confirmed.bound.original.original.action, confirmed.bound.result, transfer.data.event.nextSessionEpoch);
  check(equal(entry.usage, confirmed.data.entry.usage) && entry.latestEvent
    && equivalentOperationWire(entry.latestEvent, transfer.data.event, 'event'), 'service did not acknowledge exact transfer');
}
export async function loadTransferAck(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation, transfer: RetainedTransfer) {
  const ack = await loadOperationRecord<{ intent: ProtocolRef; entry: AgenticaOperationEntry }>(pages, transferStageKey(transfer.reference, 'ack'), 'agentica-transfer-ack');
  if (!ack) return null;
  fields(ack.data, 'intent entry');
  check(ack.source.operation === 'agentica.operation.transfer-ack' && equal(ack.source.input, { action: identity.storageKey, ...ack.data })
    && equal(ack.data.intent, transfer.reference) && ack.row.revision > transfer.row.revision, 'transfer acknowledgement changed');
  validateTransferAck(ack.data.entry, confirmed, transfer); return ack;
}
export async function loadTransferAuthority(pages: OperationRead, identity: PreparedAction, confirmed: ConfirmedOperation, ref: ProtocolRef) {
  const authority = await loadOperationRecord<TransferAuthority>(pages, ref.key, 'agentica-transfer-authority', ref); check(authority, 'missing transfer authority');
  fields(authority.data, 'intent guardRevision operationRevision guardAdoption navigationAdoption');
  const transfer = await loadTransferIntent(pages, identity, confirmed, authority.data.intent);
  const ack = await loadTransferAck(pages, identity, confirmed, transfer); check(ack, 'transfer authority lacks exact ACK');
  const adopted = await loadTransferAdoptions(pages, confirmed, transfer, ack.row.revision);
  check(ref.key === transferStageKey(transfer.reference, 'authority') && authority.source.operation === 'agentica.operation.transfer-authorize'
    && equal(authority.source.input, { action: identity.storageKey, intent: transfer.reference })
    && authority.source.expected.owner === transfer.source.expected.owner && authority.source.expected.epoch === transfer.source.expected.epoch
    && authority.data.guardAdoption === adopted.guard.source.attemptId && authority.data.navigationAdoption === adopted.navigation.source.attemptId
    && authority.data.guardRevision === adopted.guard.receipt.afterRevision && authority.data.operationRevision === adopted.navigation.receipt.afterRevision
    && authority.row.revision > Math.max(authority.data.guardRevision, authority.data.operationRevision), 'transfer authority source changed');
  return { ...authority, transfer };
}

export { writeOperationRecord };

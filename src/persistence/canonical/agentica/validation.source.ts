import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { fields } from '../roster/codec';
import { navigationRecordRef } from '../navigation/host';
import { check, isObject, jsonBytes, request as validateRequest, sameFence } from '../validation';
import { equal, snapshotJson, snapshotReference } from './validation';
import { MAX_PROOF_BYTES, MAX_SOURCE_REQUEST_BYTES } from './types';
import type { ProtocolRead, ProtocolRef, ProtocolSource, ProtocolWrite } from './types';

export function snapshotRequest(input: CanonicalRequest): CanonicalRequest {
  jsonBytes(input, MAX_SOURCE_REQUEST_BYTES); return validateRequest(input);
}
export function source(tx: Pick<CanonicalWork, 'head'>, input: CanonicalRequest, kind: ProtocolSource['kind']): ProtocolSource {
  const request = snapshotRequest(input);
  check(tx.head.status === 'ready' && sameFence(request.expected, canonicalFence(tx.head)), 'Agentica writer custody changed');
  return { schema: 1, kind, sourceAttemptId: request.attemptId, sourceRequest: request, owner: tx.head.owner, epoch: tx.head.epoch };
}

/** Kernel readers own receipt/fence validation; this layer checks only protocol-specific bindings. */
export async function readSource(pages: ProtocolRead, ref: ProtocolRef, kind: ProtocolSource['kind'], extra: string) {
  ref = snapshotReference(ref);
  let record, original;
  if (kind === 'agentica-publication') {
    ({ record, source: original } = await pages.savedSnapshot(ref.key));
  } else {
    record = await pages.get('execution', ref.key); check(record && isObject(record.value), 'missing Agentica source record');
    const { receipt, source } = await pages.sourceReceipt(record.value.sourceAttemptId as string); original = source;
    check(receipt.afterRevision === record.revision && isObject(receipt.result), 'Agentica record source changed');
    if (kind === 'agentica-result') check(['standalone', 'navigation', 'interaction'].includes(record.value.proof as string), 'invalid action proof format');
    if (kind === 'agentica-result' && record.value.proof !== 'standalone') {
      check(record.value.proof === 'interaction' ? source.operation === 'operation.admit'
        : ['operation.admit', 'navigation.advance', 'operation.settle'].includes(source.operation), 'invalid durable action source');
      const host = fields(receipt.result.host, 'actionResult', 'event');
      check(equal(host.actionResult, navigationRecordRef(record, source.attemptId)), 'navigation action result proof changed');
    } else {
      check(!Object.hasOwn(receipt.result, 'host'), 'unexpected navigation action proof');
      check(receipt.result.recordId === record.id && receipt.result.recordWitness === canonicalJson(record)
        && equal(receipt.result.reference, ref), 'Agentica record source changed');
    }
  }
  const row = fields(record.value, `schema kind sourceAttemptId sourceRequest owner epoch ${extra}`);
  check(record.id === ref.id && record.key === ref.key && record.indexes.length === 0 && row.schema === 1 && row.kind === kind, 'Agentica source reference changed');
  jsonBytes(row.sourceRequest, MAX_SOURCE_REQUEST_BYTES);
  check(equal(row.sourceRequest, original) && row.sourceAttemptId === original.attemptId
    && row.owner === original.expected.owner && row.epoch === original.expected.epoch, 'Agentica source custody changed');
  return structuredClone(row) as unknown as ProtocolSource;
}

export async function writeSource(tx: CanonicalWork, key: string, value: ProtocolSource): Promise<ProtocolWrite> {
  value = snapshotJson(value);
  check(!await tx.pages.get('execution', key), 'Agentica source is immutable');
  const row = await tx.pages.set('execution', key, value as unknown as JsonObject), ref = { key, id: row.id };
  // Snapshot restoration and ordinary record provenance use their respective kernel contracts.
  const proof: JsonObject = value.kind === 'agentica-publication'
    ? { snapshotRecordId: row.id, snapshotWitness: canonicalJson(row) }
    : { recordId: row.id, recordWitness: canonicalJson(row) };
  const receipt: JsonObject = { ...proof, reference: ref };
  jsonBytes(receipt, MAX_PROOF_BYTES); return { reference: ref, receipt };
}

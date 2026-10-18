import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, jsonBytes, request as validateRequest, sameFence } from '../validation';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';
import type { PreparedAction, ProtocolRef, ProtocolWrite } from './types';
import type { OperationRead } from './operation.types';

export function operationKey(identity: PreparedAction, suffix = 'confirmation') {
  identity = snapshotPrepared(identity); return `agentica/operations/${identity.storageKey.slice(-64)}/${suffix}`;
}
export function operationRequest(tx: Pick<CanonicalWork, 'head'>, input: CanonicalRequest, operation: string, expected: unknown) {
  const request = validateRequest(input);
  check(request.operation === operation && equal(request.input, expected), 'operation command input changed');
  check(tx.head.status === 'ready' && sameFence(request.expected, canonicalFence(tx.head)), 'operation writer custody changed');
  return request;
}
export async function loadOperationRecord<T>(pages: OperationRead, key: string, kind: string, reference?: ProtocolRef) {
  const ref = reference && snapshotReference(reference), row = await pages.get('execution', key);
  if (!row) { check(!ref, 'missing referenced operation record'); return null; }
  const value = fields(row.value, 'schema kind sourceAttemptId data');
  check(row.indexes.length === 0 && value.schema === 1 && value.kind === kind && (!ref || equal(ref, { key, id: row.id })), 'operation record binding changed');
  const { receipt, source } = await pages.sourceReceipt(value.sourceAttemptId as string);
  jsonBytes(receipt.result, 12 * 1024);
  const claim = kind === 'agentica-decision-claim';
  const result = fields(receipt.result, claim ? 'agenticaOperation claimedParent' : 'agenticaOperation');
  if (claim) {
    const companion = fields(result.claimedParent, 'key id recordWitness');
    snapshotReference({ key: companion.key as string, id: companion.id as string });
    check(typeof companion.recordWitness === 'string', 'invalid claimed parent witness');
  }
  check(receipt.afterRevision === row.revision && equal(result.agenticaOperation, { key, id: row.id, recordWitness: canonicalJson(row) }), 'operation record source changed');
  return { reference: { key, id: row.id }, data: snapshotJson(value.data) as unknown as T, row, source, receipt };
}
export async function writeOperationRecord<T>(tx: CanonicalWork, request: CanonicalRequest, key: string, kind: string, data: T): Promise<ProtocolWrite> {
  const value = snapshotJson({ schema: 1, kind, sourceAttemptId: request.attemptId, data });
  check(!await tx.pages.get('execution', key), 'operation record is immutable');
  const row = await tx.pages.set('execution', key, value as unknown as JsonObject), reference = { key, id: row.id };
  const receipt = { agenticaOperation: { ...reference, recordWitness: canonicalJson(row) } };
  jsonBytes(receipt, 12 * 1024); return { reference, receipt };
}

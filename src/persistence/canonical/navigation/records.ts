import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import type { CanonicalOperation, CanonicalRequest } from '../types';
import { check, isObject, validId } from '../validation';
import { json, same } from '../world/records';
import { destinationBinding, destinationProgress } from './validation';
import type { DestinationProgress } from './types';

export const destinationKey = (id: string) => { check(validId(id), 'invalid destination ID'); return `navigation/destination/${id}`; };
type Reader = Pick<CanonicalPages, 'get' | 'sourceReceipt'>;
export async function loadDestination(pages: Reader, operation: CanonicalOperation) {
  destinationBinding(operation.binding);
  const row = await pages.get('execution', destinationKey(operation.id)); check(row && row.indexes.length === 0, 'missing retained destination');
  const p = destinationProgress(row.value), { receipt, source } = await pages.sourceReceipt(p.sourceAttemptId);
  check(p.operationId === operation.id && same(p.binding, operation.binding) && receipt.afterRevision === row.revision
    && isObject(receipt.result) && receipt.result.recordId === row.id && receipt.result.recordWitness === canonicalJson(row)
    && p.owner === source.expected.owner && p.epoch === source.expected.epoch, 'destination source changed');
  check(isObject(source.input) && source.input.operationId === operation.id, 'foreign destination source');
  if (p.sequence === 0) check(source.operation === 'operation.admit' && p.sourceAttemptId === operation.admissionAttemptId
    && p.steps === 0 && p.replans === 0, 'invalid destination admission');
  else check(source.operation === 'navigation.advance' && source.input.sequence === p.sequence - 1, 'invalid destination sequence source');
  const admitted = await pages.sourceReceipt(operation.admissionAttemptId);
  check(isObject(admitted.receipt.result) && admitted.receipt.result.startedAt === p.startedAt, 'destination clock changed');
  return p;
}
export async function saveDestination(pages: CanonicalPages, value: DestinationProgress, request: CanonicalRequest) {
  const p = destinationProgress({ ...value, sourceAttemptId: request.attemptId, owner: request.expected.owner, epoch: request.expected.epoch });
  const record = await pages.set('execution', destinationKey(p.operationId), json(p));
  return { progress: p, result: json({ operationId: p.operationId, status: p.status, reason: p.reason, sequence: p.sequence,
    steps: p.steps, replans: p.replans, startedAt: p.startedAt, recordId: record.id, recordWitness: canonicalJson(record) }) };
}

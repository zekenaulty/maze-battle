import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import { operationInput } from '../operationValidation';
import type { CanonicalOperation, CanonicalRequest } from '../types';
import { check, isObject, validId } from '../validation';
import { json, same } from '../world/records';
import { interactionBinding, interactionProgress } from './validation';
import type { InteractionProgress } from './types';

export const interactionKey = (id: string) => { check(validId(id), 'invalid interaction ID'); return `interaction/command/${id}`; };
export async function loadInteraction(pages: Pick<CanonicalPages, 'get' | 'sourceReceipt'>, operation: CanonicalOperation) {
  interactionBinding(operation.binding);
  const row = await pages.get('execution', interactionKey(operation.id));
  check(row && row.indexes.length === 0, 'missing retained interaction');
  const p = interactionProgress(row.value), { receipt, source } = await pages.sourceReceipt(p.sourceAttemptId);
  const admission = p.sequence === 0 ? { receipt, source } : await pages.sourceReceipt(operation.admissionAttemptId);
  const input = operationInput(admission.source, 'admit');
  check(admission.source.attemptId === operation.admissionAttemptId && input.operationId === operation.id
    && same(input.binding, operation.binding) && p.owner === admission.source.expected.owner && p.epoch === admission.source.expected.epoch,
  'interaction admission authority changed');
  check(p.operationId === operation.id && same(p.binding, operation.binding) && receipt.afterRevision === row.revision
    && isObject(receipt.result) && receipt.result.recordId === row.id && receipt.result.recordWitness === canonicalJson(row)
    && p.owner === source.expected.owner && p.epoch === source.expected.epoch, 'interaction source changed');
  check(isObject(source.input) && source.input.operationId === operation.id, 'foreign interaction source');
  if (p.sequence === 0) check(source.operation === 'operation.admit' && p.sourceAttemptId === operation.admissionAttemptId,
    'invalid interaction admission source');
  else {
    const input = fields(source.input, 'operationId sequence');
    check(source.operation === 'interaction.apply' && input.sequence === 0
      && admission.receipt.afterRevision <= receipt.beforeRevision, 'invalid interaction apply source');
  }
  check(receipt.result.operationId === p.operationId && receipt.result.status === p.status && receipt.result.reason === p.reason
    && receipt.result.sequence === p.sequence && same(receipt.result.outcome, p.result), 'interaction receipt outcome changed');
  return p;
}
export async function saveInteraction(pages: CanonicalPages, value: InteractionProgress, request: CanonicalRequest) {
  const p = interactionProgress({ ...value, sourceAttemptId: request.attemptId, owner: request.expected.owner, epoch: request.expected.epoch });
  const record = await pages.set('execution', interactionKey(p.operationId), json(p));
  return { progress: p, result: json({ operationId: p.operationId, status: p.status, reason: p.reason, sequence: p.sequence,
    outcome: p.result, recordId: record.id, recordWitness: canonicalJson(record) }) };
}

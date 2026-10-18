import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { OperationCommit, OperationHostHooks, OperationPreparation } from '../operationHost';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, jsonBytes } from '../validation';
import { loadOriginalAction } from './actions.original';
import { actionResultWrite } from './actions.result';
import { assertPublicationCurrent } from './publication';
import { equal, snapshotJson, snapshotPrepared } from './validation';
import { snapshotRequest } from './validation.source';
import { MAX_PROOF_BYTES, MAX_RESULT_BYTES, type ActionResult, type PreparedAction, type ProtocolRead } from './types';

function reader(view: OperationPreparation): ProtocolRead {
  const { getExecution, savedSnapshot, sourceReceipt } = view;
  return { get: (area, key) => { check(area === 'execution', 'action reader cannot read hidden world'); return getExecution(key); },
    savedSnapshot, sourceReceipt };
}

/**
 * One original action/result, not an executor or launch grant. Caller validates capability, target and deadline.
 * Result construction is host-owned and may await only guarded transaction work.
 */
export function operationActionHooks<P>(identity: PreparedAction, proof: Exclude<ActionResult['proof'], 'standalone'>,
  resultFor: (view: OperationCommit<P>) => AgenticaResult | Promise<AgenticaResult>): OperationHostHooks<P> {
  identity = snapshotPrepared(identity);
  let prepared: CanonicalRequest | undefined;
  return {
    async prepare(view) {
      prepared = undefined;
      const head = snapshotJson(view.head), request = snapshotRequest(view.request);
      const pages = reader(view), pending = await loadOriginalAction(pages, identity);
      check(pending && pending.original.effect === 'writesLocalState', 'navigation needs an original writable action');
      assertPublicationCurrent(pending.publication, head);
      check(!await pages.get('execution', `${identity.storageKey}/result`), 'action already has a result; reconcile original');
      prepared = request;
    },
    async commit(view) {
      const head = snapshotJson(view.head), request = snapshotRequest(view.request), operationId = view.operation.id;
      const pages = reader(view), appendExecution = view.appendExecution;
      check(prepared && equal(prepared, request), 'navigation action was not prepared'); prepared = undefined;
      // Synchronous builders transfer their result now, not after an unnecessary await.
      const candidate = resultFor(view), input = snapshotJson(candidate instanceof Promise ? await candidate : candidate, MAX_RESULT_BYTES);
      const write = await actionResultWrite(pages, head, request, identity, input, proof);
      check(!('existing' in write), 'action already has a result; reconcile original');
      check(write.value.result.disposition === 'applied' && write.value.result.operation?.operationId === operationId
        && write.value.result.afterRevision === head.revision + 1, 'navigation result must bind this operation commit');
      const actionResult = await appendExecution(write.key, write.value as unknown as JsonObject);
      jsonBytes(actionResult, MAX_PROOF_BYTES); return { actionResult };
    },
  };
}

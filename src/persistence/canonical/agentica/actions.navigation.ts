import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { NavigationCommit, NavigationHostHooks, NavigationPreparation } from '../navigation/host';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, jsonBytes } from '../validation';
import { loadOriginalAction } from './actions.original';
import { actionResultWrite } from './actions.result';
import { assertPublicationCurrent } from './publication';
import { equal } from './validation';
import { MAX_PROOF_BYTES, type PreparedAction, type ProtocolRead } from './types';

function reader(view: NavigationPreparation): ProtocolRead {
  return { get: (area, key) => { check(area === 'execution', 'action reader cannot read hidden world'); return view.getExecution(key); },
    savedSnapshot: key => view.savedSnapshot(key), sourceReceipt: id => view.sourceReceipt(id) };
}

/**
 * One original action/result, not an executor or launch grant. Caller validates capability, target and deadline.
 * Result construction is host-owned and may await only guarded transaction work.
 */
export function navigationActionHooks(identity: PreparedAction,
  resultFor: (view: NavigationCommit) => AgenticaResult | Promise<AgenticaResult>): NavigationHostHooks {
  let prepared: CanonicalRequest | undefined;
  return {
    async prepare(view) {
      prepared = undefined;
      const pages = reader(view), pending = await loadOriginalAction(pages, identity);
      check(pending && pending.original.effect === 'writesLocalState', 'navigation needs an original writable action');
      assertPublicationCurrent(pending.publication, view.head);
      check(!await pages.get('execution', `${identity.storageKey}/result`), 'action already has a result; reconcile original');
      prepared = structuredClone(view.request);
    },
    async commit(view) {
      check(prepared && equal(prepared, view.request), 'navigation action was not prepared'); prepared = undefined;
      const write = await actionResultWrite(reader(view), view.head, view.request, identity, await resultFor(view), 'navigation');
      check(!('existing' in write), 'action already has a result; reconcile original');
      check(write.value.result.disposition === 'applied' && write.value.result.operation?.operationId === view.operation.id
        && write.value.result.afterRevision === view.head.revision + 1, 'navigation result must bind this operation commit');
      const actionResult = await view.appendExecution(write.key, write.value as unknown as JsonObject);
      jsonBytes(actionResult, MAX_PROOF_BYTES); return { actionResult };
    },
  };
}

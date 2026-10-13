import type { AgenticaAction } from '../../../services/agentica/contracts';
import { check, isObject } from '../validation';
import { reconcileAction } from './actions';
import { prepareLookedUpAction, validateActionLookup, type ActionLookup } from './validation';
import type { ProtocolRead } from './types';
export { prepareActionLookup } from './validation';

/** SDK loadAction supplies only its exact key, not the original action/fingerprint. */
export async function readActionByKey(pages: ProtocolRead, lookup: ActionLookup) {
  validateActionLookup(lookup);
  const row = await pages.get('execution', lookup.storageKey);
  if (!row) {
    check(!await pages.get('execution', `${lookup.storageKey}/result`), 'retained result without original action');
    return null;
  }
  check(isObject(row.value), 'invalid original action');
  return reconcileAction(pages, prepareLookedUpAction(lookup, row.value.action as unknown as AgenticaAction));
}

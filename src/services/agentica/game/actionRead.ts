import type { AgenticaAction } from '../contracts';
import { readCanonical } from '../../../persistence/canonical/read';
import { prepareAction, readAction } from '../../../persistence/canonical/agentica/actions';
import { prepareActionLookup, readActionByKey } from '../../../persistence/canonical/agentica/actions.lookup';

/** Original receipts remain readable without a socket, current grant, or new execution permission. */
export async function loadGameAction(key: string) {
  const lookup = await prepareActionLookup(key);
  return (await readCanonical(pages => readActionByKey(pages, lookup))).value;
}
export async function reconcileGameAction(action: AgenticaAction) {
  const identity = await prepareAction(action);
  return (await readCanonical(pages => readAction(pages, identity))).value?.result ?? null;
}

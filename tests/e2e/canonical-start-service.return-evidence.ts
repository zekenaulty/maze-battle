import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readActionResultSource } from '../../src/persistence/canonical/agentica/actions.result';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readCanonical } from '../../src/persistence/canonical/read';

/** Historical evidence oracle only. Nothing here enters a planner context. */
export async function returnEvidence(actions: AgenticaAction[]) {
  const result = [];
  for (const action of actions) {
    const identity = await prepareAction(action);
    const retained = (await readCanonical(async pages => {
      const original = await readAction(pages, identity);
      if (!original?.resultReference) throw Error('Missing original action result.');
      return { result: original.result, source: await readActionResultSource(pages, identity, original.resultReference) };
    })).value;
    const operation = (await readAgenticaOperation(identity)).value;
    result.push({ action, ...retained, operation });
  }
  return result;
}

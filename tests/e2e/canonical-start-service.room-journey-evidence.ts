import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readCanonical } from '../../src/persistence/canonical/read';
import { fields } from '../../src/persistence/canonical/roster/codec';
import { reference, snapshotReference } from '../../src/persistence/canonical/agentica/validation';
import { retryHistory } from './canonical-start-service.history-evidence';
export { corpusCustody } from './canonical-start-service.corpus-recovery.evidence';

/** Audit/replay only. No fixture audit value enters the planner or a navigation request. */
export async function journeyReplay(actions: AgenticaAction[]) {
  const results = [];
  for (const action of actions) {
    const identity = await prepareAction(action);
    const original = (await readCanonical(pages => readAction(pages, identity))).value;
    if (!original?.result) throw Error('Missing completed original action.');
    const input = fields(original.original.sourceRequest.input, 'action grant publication');
    reference(input.grant); reference(input.publication);
    const binding = { grant: snapshotReference(input.grant), publication: snapshotReference(input.publication) };
    results.push({ original, binding, retry: await retryHistory([action], binding) });
  }
  return results;
}

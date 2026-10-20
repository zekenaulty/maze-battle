import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readActionResultSource } from '../../src/persistence/canonical/agentica/actions.result';
import type { ProtocolRead } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';

/** Test-only retained replay oracle. Never delivered to the planner; no world or live operation access. */
export async function historyEvidence(actions: AgenticaAction[]) {
  const results = [];
  for (const action of actions) {
    const identity = await prepareAction(action);
    results.push((await readCanonical(async pages => {
      const reads = { execution: 0, receipts: 0, snapshots: 0 };
      const historical: ProtocolRead = {
        get: (area, key) => {
          if (area !== 'execution') throw Error(`Forbidden history replay read: ${area}`);
          reads.execution++; return pages.get(area, key);
        },
        sourceReceipt: id => { reads.receipts++; return pages.sourceReceipt(id); },
        savedSnapshot: ref => { reads.snapshots++; return pages.savedSnapshot(ref); },
      };
      const original = await readAction(historical, identity);
      if (!original?.resultReference) throw Error('Missing original historical query result.');
      return { result: original.result,
        source: await readActionResultSource(historical, identity, original.resultReference), reads };
    })).value);
  }
  return results;
}

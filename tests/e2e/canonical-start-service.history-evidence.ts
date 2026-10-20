import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readActionResultSource } from '../../src/persistence/canonical/agentica/actions.result';
import type { ProtocolRead } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import type { GameSession } from '../../src/services/game/GameSession';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';

export function historyReadMetrics() {
  const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession;
  const meters = Reflect.get(globalThis, '__canonicalDecisionReadMeters') as { reads: number; lookups: number; bytes: number }[];
  return structuredClone({ fresh: meters ?? [],
    commits: session.view.diagnostics.filter(row => row.action === 'agentica.action.resolve') });
}

/** Exact completed hooks remain usable after withdrawal; this is not another service delivery. */
export async function retryHistory(actions: AgenticaAction[], binding: ActionBinding) {
  const stopped = new AbortController(); stopped.abort(); let submissions = 0;
  const hooks = createGameActionHooks({ hostSignal: stopped.signal, submitHostCommand() {
    submissions++; throw Error('Completed retry must not submit a fresh command.');
  } }, binding);
  const results = [];
  for (const action of actions) {
    const key = actionKey(action), original = await hooks.loadAction(key);
    if (original?.status !== 'completed') throw Error('Expected the exact retained completion.');
    await hooks.saveAction(key, original);
    results.push({ original, reconciled: await hooks.reconcileAction!(action, original),
      actionResult: await hooks.onAction(action), after: await hooks.loadAction(key) });
  }
  return { results, submissions };
}

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

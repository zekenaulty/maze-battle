import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { successorGrantKey } from '../../src/persistence/canonical/agentica/run-grant.certificate';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';
import type { PreparedAction } from '../../src/persistence/canonical/agentica/types';
import type { OperationBinding } from '../../src/persistence/canonical/agentica/operation.types';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import type { decisionSdkCapture } from './canonical-start-service.decision-log';

type Log = ReturnType<ReturnType<typeof decisionSdkCapture>['read']>;

/** Read actual IndexedDB records only; SDK callbacks are not canonical admission evidence. */
export async function decisionState(launchId: string, binding: OperationBinding, log: Log, restored?: PreparedAction) {
  const identities = await Promise.all(log.actions.map(item => prepareAction(item.action)));
  const index = log.actions.findIndex(item => item.window === 'initial' && item.action.capabilityId === 'maze.navigate');
  const admitted = index >= 0 && log.results.some(item => item.result.actionId === identities[index].action.actionId && item.result.operation);
  const identity = restored ?? (admitted ? identities[index] : null);
  const originals = [];
  if (restored) originals.push((await readCanonical(pages => readAction(pages, restored))).value);
  for (const action of identities) originals.push((await readCanonical(pages => readAction(pages, action))).value);
  const records = (await readCanonical(async pages => {
    const key = identity && successorGrantKey(identity.storageKey), row = key && await pages.get('execution', key);
    return {
      grant: row ? await loadRunGrant(pages, { key: row.key, id: row.id }) : null,
      selection: await readPublicationSelection(pages, launchId),
      intent: identity ? await loadDecisionIntent(pages, identity) : null,
      claim: identity ? await loadDecisionClaim(pages, identity) : null,
    };
  })).value;
  return { ...records, originals, head: (await readCanonicalHead()).head, launch: (await readLaunch(launchId)).value,
    operation: identity ? (await readAgenticaOperation(identity)).value : null,
    terminal: identity ? (await readAgenticaTerminal(identity, binding)).value : null };
}

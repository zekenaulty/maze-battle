import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { GameSession } from '../../src/services/game/GameSession';
import { readCanonical } from '../../src/persistence/canonical/read';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';

let captured: { session: GameSession; signal: AbortSignal } | undefined;
/** Test-only lifetime witness. No commands, effect authority, or replacement GameSession. */
export function appLifetime() {
  const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession;
  captured ??= { session, signal: session.hostSignal };
  return { sameController: captured.session === session, sameSignal: captured.signal === session.hostSignal,
    aborted: captured.signal.aborted, controlled: session.view.controlled };
}
/** Read exact original/selected successor and receipts; never construct a service transport. */
export async function appNavigationEvidence(initial: AgenticaAction, successor?: AgenticaAction) {
  const launch = (await readLaunch()).value!;
  const identity = await prepareAction(initial);
  const binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
  const claim = (await readCanonical(pages => loadDecisionClaim(pages, identity))).value;
  const selection = (await readCanonical(pages => readPublicationSelection(pages, launch.binding.launchId))).value;
  const childIdentity = successor ? await prepareAction(successor) : null;
  const guardAdoption = claim?.decision.data.adoption
    ? (await readCanonical(pages => pages.sourceReceipt(`${claim.decision.reference.id}:guard`))).value : null;
  return {
    parent: (await readAgenticaOperation(identity)).value,
    parentTerminal: (await readAgenticaTerminal(identity, binding)).value,
    claim, selection, guardAdoption,
    child: childIdentity ? (await readAgenticaOperation(childIdentity)).value : null,
    childTerminal: childIdentity && selection ? (await readAgenticaTerminal(childIdentity, {
      grant: selection.value.data.grant, publication: selection.value.data.publication,
    })).value : null,
  };
}

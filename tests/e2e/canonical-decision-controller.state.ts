import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { successorGrantKey } from '../../src/persistence/canonical/agentica/run-grant.certificate';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';
import { readCanonical } from '../../src/persistence/canonical/read';
import type { TransferSeed } from './canonical-operation-transfer.setup';

export async function controllerState(seed: TransferSeed) {
  const identity = await prepareAction(seed.action), result = await readAgenticaTerminal(identity, seed.binding), terminal = result.value!;
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value;
  const claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value;
  const key = successorGrantKey(identity.storageKey), grant = (await readCanonical(async p => {
    const row = await p.get('execution', key); return row ? loadRunGrant(p, { key, id: row.id }) : null;
  })).value;
  const launch = terminal.bound.launch;
  const selection = (await readCanonical(p => readPublicationSelection(p, launch.binding.launchId))).value;
  const ackId = terminal.bound.operation.acknowledgementAttemptId;
  const acknowledgement = ackId ? (await readCanonical(p => p.sourceReceipt(ackId))).value : null;
  return { head: result.head, launch, selection, grant, acknowledgement,
    operation: terminal.bound.operation, progress: terminal.bound.progress, terminal: terminal.event,
    prefix: { probe: terminal.probe, previous: terminal.previous, predecessor: terminal.predecessor },
    intent: intent && { reference: intent.reference, data: intent.data, source: intent.source, row: intent.row },
    claim: claim && { reference: claim.reference, data: claim.data, source: claim.source, row: claim.row } };
}

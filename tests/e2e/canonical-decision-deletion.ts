import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readPublication } from '../../src/persistence/canonical/agentica/publication';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { publishGamePublication, renewGamePublication } from '../../src/services/agentica/game/publication';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { fundLaunch, startGame } from './canonical-agentica-actions.setup';
import { draftNavigationWindow } from './canonical-decision-window';
import type { TransferSeed } from './canonical-operation-transfer.setup';

/** The original action uses a renewed publication, not the root launch publication. */
export async function seedRenewedPublicationWindow() {
  const session = await startGame(), funded = await fundLaunch(session), launch = (await readLaunch(funded.launchId)).value!;
  const publication = await publishGamePublication(session);
  const previous = (await readCanonical(p => readPublicationSelection(p, funded.launchId))).value!;
  const binding = { grant: launch.grant!.ref, publication };
  await renewGamePublication(session, { launchId: funded.launchId, ...binding, previousSelection: previous.ref });
  const published = (await readCanonical(p => readPublication(p, publication))).value;
  const usage = { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 };
  const { action } = draftNavigationWindow(session, { binding, started: launch.run!.value.data.started,
    request: launch.acceptedStart, usage });
  action.expectedRevision = published.wireRevision;
  const hooks = createGameActionHooks(session, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action); if (!admission.operation) throw Error(JSON.stringify(admission));
  const seed: TransferSeed = { action, binding, launchGuard: launch.guard.id, operationId: admission.operation.operationId,
    entry: { request: structuredClone(launch.acceptedStart), action, admission, activeEpoch: action.sessionEpoch, state: 'parked', usage } };
  return { session, seed };
}

/** Corrupt only this synthetic fixture's immutable record, leaving its index and source receipt intact. */
export async function deleteDecisionEvidence(reference: ProtocolRef) {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    const row = await db.get('records', [head.gameId, reference.id]);
    if (!row || row.id !== reference.id || row.key !== reference.key || row.area !== 'execution')
      throw Error('Expected exact retained execution record');
    await db.delete('records', [head.gameId, reference.id]);
    if (await db.get('records', [head.gameId, reference.id])) throw Error('Fixture deletion did not apply');
    return row;
  } finally { db.close(); }
}

import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import type { TransferSeed } from './canonical-operation-transfer.setup';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { retainDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { json } from '../../src/persistence/canonical/world/records';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import type { RemoteSnapshot } from './canonical-decision-controller.remote';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import { executeSettingsCommand } from '../../src/persistence/canonical/game/settings';

/** Deliberate corruption and raw funding inspection only in the disposable controller fixture database. */
export async function deleteControllerEvidence(store: 'receipts' | 'records', id: string) {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try { await db.delete(store, [head.gameId, id]); } finally { db.close(); }
}
export async function controllerFunding(seed: TransferSeed, childId?: string) {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try { return { head, root: await db.get('operations', [head.gameId, seed.launchGuard]),
    navigation: await db.get('operations', [head.gameId, seed.operationId]),
    ...(childId ? { child: await db.get('operations', [head.gameId, childId]) } : {}) }; }
  finally { db.close(); }
}

/** Retain later evidence through the real writer; never create a grant or alter the earlier ACK. */
export async function retainControllerClaim(port: CanonicalHostPort, seed: TransferSeed, snapshot: RemoteSnapshot) {
  const captured = structuredClone(snapshot), identity = await prepareAction(seed.action);
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value;
  if (!intent) throw Error('Fixture claim needs its retained intention');
  const { started, entry } = captured;
  return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim',
    input: json({ action: identity.storageKey, intent: intent.reference, started, entry }),
    execute: (request, options) => executeCanonical(request,
      async tx => (await retainDecisionClaim(tx, request, identity, intent.reference, started, entry)).receipt, options) });
}

/** Advance only the fence with a real domain commit outside the recovery-gated GameSession. */
export async function advanceControllerRevision() {
  const { head } = await readCanonicalHead();
  return executeSettingsCommand(gameRequest(head, 'settings.command', { kind: 'throttle', ms: 700 }));
}

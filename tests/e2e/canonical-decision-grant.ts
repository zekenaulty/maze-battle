import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { grantDecisionSuccessor } from '../../src/persistence/canonical/agentica/run-grant';
import { successorGrantKey } from '../../src/persistence/canonical/agentica/run-grant.certificate';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence, operateCanonical } from '../../src/persistence/canonical/transaction';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { json } from '../../src/persistence/canonical/world/records';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { GameSession } from '../../src/services/game/GameSession';
import type { TransferSeed } from './canonical-operation-transfer.setup';

const commands = new Map<string, CanonicalRequest>();
export async function grantWindow(session: GameSession, seed: TransferSeed, replay = false) {
  const identity = await prepareAction(seed.action);
  if (replay) return grantDecisionSuccessor(commands.get(identity.storageKey)!, identity);
  const claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value!;
  const launchId = claim.decision.terminal.bound.launch.binding.launchId;
  const selected = (await readCanonical(p => readPublicationSelection(p, launchId))).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.decision.grant',
    input: json({ action: identity.storageKey, binding: seed.binding, claim: claim.reference,
      publication: claim.decision.data.publication, previousSelection: selected.ref }),
    execute: (request, options) => {
      commands.set(identity.storageKey, structuredClone(request)); return grantDecisionSuccessor(request, identity, options);
    } });
}
export async function windowGrant(seed: TransferSeed) {
  const identity = await prepareAction(seed.action), key = successorGrantKey(identity.storageKey);
  return (await readCanonical(async p => {
    const row = await p.get('execution', key); return row ? loadRunGrant(p, { key, id: row.id }) : null;
  })).value;
}
export async function adoptWindowGuard(session: GameSession, seed: TransferSeed, exact = true) {
  const identity = await prepareAction(seed.action), intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value!;
  const head = (await readCanonicalHead()).head;
  const request: CanonicalRequest = { attemptId: exact ? `${intent.reference.id}:guard` : crypto.randomUUID(),
    operation: 'operation.adopt', expected: canonicalFence(head), deadlineAt: null, input: { operationId: seed.launchGuard } };
  return session.submitHostCommand({ kind: 'retry', request,
    execute: (r, options) => operateCanonical(r, 'adopt', undefined, options) });
}
export async function replayWindow(session: GameSession, seed: TransferSeed) {
  const hooks = createGameActionHooks(session, seed.binding), action = seed.action;
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  return hooks.onAction!(action);
}

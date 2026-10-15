import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { retainDecisionIntent } from '../../src/persistence/canonical/agentica/decision';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { retainDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { terminalAcknowledgement } from '../../src/persistence/canonical/agentica/terminal.ack';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { json } from '../../src/persistence/canonical/world/records';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { seedTransfer, type TransferSeed } from './canonical-operation-transfer.setup';
import { startGame, fundLaunch } from './canonical-agentica-actions.setup';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';
import { grantWindow } from './canonical-decision-grant';
import { arriveSuccessor } from './canonical-decision-ack.successor';
import type { GameSession } from '../../src/services/game/GameSession';

export type Scenario = 'empty' | 'funded' | 'navigation' | 'decision' | 'successor' | 'acknowledged';
export async function seedRecovery(scenario: Scenario) {
  if (scenario === 'empty' || scenario === 'funded') {
    const session = await startGame(); if (scenario === 'funded') await fundLaunch(session);
    return { session, seed: null as TransferSeed | null };
  }
  const { session, seed } = await seedTransfer();
  if (scenario === 'navigation') return { session, seed };
  await confirmNavigation(session, seed);
  for (let i = 0; i < 3; i++) await advanceNavigation(session, seed);
  await settleNavigation(session, seed);
  await retainRecoveryDecision(session, seed, scenario);
  return { session, seed };
}
async function retainRecoveryDecision(session: GameSession, seed: TransferSeed, scenario: Scenario) {
  const identity = await prepareAction(seed.action), binding = seed.binding, publication = await publishGamePublication(session);
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision',
    input: json({ action: identity.storageKey, binding, publication }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainDecisionIntent(tx, r, identity, binding, publication)).receipt, options) });
  if (scenario === 'decision') return;
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value!;
  const launch = (await readLaunch()).value!, started = { ...launch.run!.value.data.started, runId: crypto.randomUUID() };
  const entry: AgenticaOperationEntry = { ...structuredClone(seed.entry), state: 'waking', latestEvent: intent.data.event, wakeRunId: started.runId };
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim',
    input: json({ action: identity.storageKey, intent: intent.reference, started, entry }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainDecisionClaim(tx, r, identity, intent.reference, started, entry)).receipt, options) });
  await grantWindow(session, seed);
  if (scenario === 'acknowledged') {
    const proof = terminalAcknowledgement(identity, binding, entry, 'decision-handoff');
    await session.cleanupHostOperation({ kind: 'verified-ack', ...await proof.prepare(), verify: proof.verify });
  }
}

export async function nextRecoveryWindow(session: GameSession, previous: TransferSeed) {
  const seed = await arriveSuccessor(session, previous);
  await retainRecoveryDecision(session, seed, 'acknowledged'); return seed;
}

import { seedCompletedController } from './canonical-decision-controller.setup';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { retainDecisionIntent } from '../../src/persistence/canonical/agentica/decision';
import { retainDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { json } from '../../src/persistence/canonical/world/records';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { GameSession } from '../../src/services/game/GameSession';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createControllerRootRecovery } from './canonical-decision-controller.root';
import { adoptWindowGuard, grantWindow } from './canonical-decision-grant';
import { arriveSuccessor } from './canonical-decision-ack.successor';
import { controllerState } from './canonical-decision-controller.state';

export interface SeedOptions { claim?: boolean; grant?: boolean; cancel?: boolean; crossEpoch?: boolean; successorParent?: boolean }
export async function seedPregrantProof(options: SeedOptions = {}) {
  const seeded = options.successorParent ? await seedSuccessorParent() : await seedCompletedController();
  if (options.crossEpoch) { seeded.session.stop(); seeded.session = new GameSession(() => {}); await seeded.session.start(); }
  const { session, seed } = seeded, identity = await prepareAction(seed.action), binding = seed.binding;
  const publication = await publishGamePublication(session);
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision',
    input: json({ action: identity.storageKey, binding, publication }), execute: (r, opts) => executeCanonical(r,
      async tx => (await retainDecisionIntent(tx, r, identity, binding, publication)).receipt, opts) });
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value!;
  const started = { ...seeded.started, sessionEpoch: intent.data.adoption?.nextSessionEpoch ?? intent.data.event.sessionEpoch };
  const entry: AgenticaOperationEntry = { ...structuredClone(seeded.entry), state: 'waking', activeEpoch: started.sessionEpoch,
    latestEvent: intent.data.event, wakeRunId: started.runId, ...(intent.data.adoption ? { wakeAdoption: intent.data.adoption } : {}) };
  if (options.claim !== false) await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim',
    input: json({ action: identity.storageKey, intent: intent.reference, started, entry }), execute: (r, opts) => executeCanonical(r,
      async tx => (await retainDecisionClaim(tx, r, identity, intent.reference, started, entry)).receipt, opts) });
  if (options.grant) {
    if (options.crossEpoch) await adoptWindowGuard(session, seed);
    await grantWindow(session, seed);
  }
  const pending: AgenticaAction = { ...seed.action, actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: started.runId, sessionEpoch: started.sessionEpoch, expectedRevision: intent.publication.wireRevision,
    capabilityId: 'maze.inspect', arguments: { scope: 'map' } };
  const root = createControllerRootRecovery(session, seed.launchGuard);
  if (options.cancel !== false) await root.stop();
  return { session, seed, started, entry, pending, identity, root };
}
export type ProofSeed = Awaited<ReturnType<typeof seedPregrantProof>>;

async function seedSuccessorParent(): ReturnType<typeof seedCompletedController> {
  const first = await seedPregrantProof({ grant: true, cancel: false });
  const seed = await arriveSuccessor(first.session, first.seed), state = await controllerState(seed);
  const started = { ...first.started, runId: crypto.randomUUID() };
  return { session: first.session, seed, started, entry: { ...seed.entry, latestEvent: state.prefix.previous! } };
}

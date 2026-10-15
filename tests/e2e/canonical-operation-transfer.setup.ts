import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { actionFingerprint, actionKey, type AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { flatAddress } from '../../src/services/agentica/game/validation';
import { same } from '../../src/persistence/canonical/world/records';
import { fundLaunch, startGame } from './canonical-agentica-actions.setup';

export async function seedTransfer() {
  const session = await startGame(), funded = await fundLaunch(session), launch = (await readLaunch()).value!;
  const sight = session.view.game!.observation!, actor = session.view.game!.checkpoint.position;
  const queue = [{ at: actor, depth: 0 }], visited = new Set([JSON.stringify(actor)]);
  for (let i = 0; i < queue.length; i++) {
    const next = queue[i]; if (next.depth >= 3) break;
    const cell = sight.cells.find(c => same(c.at, next.at));
    for (const at of Object.values(cell?.edges ?? {})) if (at && !visited.has(JSON.stringify(at))) {
      visited.add(JSON.stringify(at)); queue.push({ at, depth: next.depth + 1 });
    }
  }
  const target = queue.find(q => q.depth === 3)?.at; if (!target) throw Error('Need earned three-edge destination');
  const run = launch.run!.value.data.started, binding = { grant: launch.grant!.ref, publication: funded.publication };
  const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...flatAddress(target) }, expectedRevision: launch.publication.wireRevision,
    deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  const hooks = createGameActionHooks(session, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action); if (!admission.operation) throw Error(JSON.stringify(admission));
  const entry: AgenticaOperationEntry = { request: structuredClone(launch.acceptedStart), action, admission, activeEpoch: action.sessionEpoch,
    state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } };
  return { session, seed: { action, binding, entry, operationId: admission.operation.operationId, launchGuard: launch.guard.id } };
}
export type TransferSeed = Awaited<ReturnType<typeof seedTransfer>>['seed'];

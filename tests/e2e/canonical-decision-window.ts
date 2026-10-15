import type { AgenticaAction, AgenticaStart } from '../../src/services/agentica/contracts';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { flatAddress } from '../../src/services/agentica/game/validation';
import type { GameSession } from '../../src/services/game/GameSession';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import { same } from '../../src/persistence/canonical/world/records';
import type { TransferSeed } from './canonical-operation-transfer.setup';

export interface NavigationWindowSource {
  binding: ActionBinding; started: LaunchStarted; request: AgenticaStart; usage: AgenticaOperationEntry['usage'];
}
/** Caller supplies the explicit window binding and service request; no initial-launch fallback. */
export function draftNavigationWindow(session: GameSession, input: NavigationWindowSource) {
  const source = structuredClone(input), game = session.view.game;
  if (!game?.observation) throw Error('Need an owned game with earned observation');
  const queue = [{ at: game.checkpoint.position, depth: 0 }], visited = new Set([JSON.stringify(queue[0].at)]);
  for (let i = 0; i < queue.length; i++) {
    const next = queue[i]; if (next.depth >= 3) break;
    const cell = game.observation.cells.find(c => same(c.at, next.at));
    for (const at of Object.values(cell?.edges ?? {})) if (at && !visited.has(JSON.stringify(at))) {
      visited.add(JSON.stringify(at)); queue.push({ at, depth: next.depth + 1 });
    }
  }
  const target = queue.find(q => q.depth === 3)?.at; if (!target) throw Error('Need another earned three-edge destination');
  const run = source.started;
  const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...flatAddress(target) }, expectedRevision: source.request.observation.revision,
    deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  return { source, action, target };
}
/** Real reserve/admit hooks; a supplied claim or placeholder binding never bypasses the production grant check. */
export async function seedNavigationWindow(session: GameSession, input: NavigationWindowSource, launchGuard: string): Promise<TransferSeed> {
  const { source, action } = draftNavigationWindow(session, input), hooks = createGameActionHooks(session, source.binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action); if (!admission.operation) throw Error(JSON.stringify(admission));
  const entry: AgenticaOperationEntry = { request: source.request, action, admission, activeEpoch: action.sessionEpoch,
    state: 'parked', usage: source.usage };
  return { action, binding: source.binding, entry, operationId: admission.operation.operationId, launchGuard };
}

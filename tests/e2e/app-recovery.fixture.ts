import type { GameSession } from '../../src/services/game/GameSession';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { earnedTargets, fundLaunch } from './canonical-agentica-actions.setup';
import { dump, fillQuota } from './canonical-decision-ack.storage';
export { dump, readLaunch };

declare global { interface Window { __appRecoverySession: GameSession } }
function session() {
  if (location.origin !== 'http://127.0.0.1:5288' || !import.meta.env.DEV) throw Error('Isolated actual-App fixture only');
  return window.__appRecoverySession;
}
export async function seedNavigation() {
  const controller = session();
  await fundLaunch(controller);
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  const binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
  const action = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...earnedTargets(controller).target },
    expectedRevision: launch.publication.wireRevision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  const hooks = createGameActionHooks(controller, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admitted = await hooks.onAction!(action);
  if (!admitted.operation) throw Error('Missing synthetic local navigation admission');
  return { actionId: action.actionId, launchId: launch.binding.launchId, owner: controller.owner };
}
export async function quotaFailure() {
  const controller = session(), lifetime = controller.hostSignal;
  await fillQuota();
  await controller.execute('settings', { kind: 'auto', enabled: true }).catch(() => {});
  return { controlled: controller.view.controlled, recovery: controller.view.recoveryRequired, live: !lifetime.aborted };
}

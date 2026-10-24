import { AgenticaHost, actionFingerprint, actionKey, type AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { flatAddress } from '../../src/services/agentica/game/validation';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { cellKey } from '../../src/persistence/canonical/knowledge/keys';
import { fundLaunch } from './canonical-agentica-actions.setup';
import { createControllerRootRecovery } from './canonical-decision-controller.root';
import { session } from './canonical-revisit.fixture';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5474') throw Error('Isolated generated host fixture only');
let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
let source: { action: AgenticaAction; binding: ActionBinding; guard: string } | undefined, release: (() => void) | undefined;
let forbiddenCalls = 0;

/** Offline start custody only, reusing the existing funded root helper. The actual App owns every write. */
export async function begin() {
  const s = session(); release = s.acquireAgenticControl();
  const funded = await fundLaunch(s), launch = (await readLaunch()).value!;
  const game = s.view.game!, sight = game.observation!, actor = game.checkpoint.position;
  const queue = [{ at: actor, depth: 0 }], seen = new Set([cellKey(actor)]);
  for (let n = 0; n < queue.length; n++) {
    const current = queue[n]; if (current.depth === 3) continue;
    const cell = sight.cells.find(c => cellKey(c.at) === cellKey(current.at));
    for (const at of Object.values(cell?.edges ?? {})) if (at && !seen.has(cellKey(at))) {
      seen.add(cellKey(at)); queue.push({ at, depth: current.depth + 1 });
    }
  }
  const target = queue.find(row => row.depth === 3 && sight.cells.some(c => cellKey(c.at) === cellKey(row.at) && !c.stairs.length))?.at;
  if (!target) throw Error('No delivered three-edge non-stair destination');
  const run = launch.run!.value.data.started, binding = { grant: launch.grant!.ref, publication: funded.publication };
  const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...flatAddress(target) }, expectedRevision: launch.publication.wireRevision,
    deadlineAt: new Date(Date.now() + funded.start.limits.actionTimeoutSeconds * 1000).toISOString() };
  const hooks = createGameActionHooks(s, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action);
  if (!admission.operation) throw Error(`Navigation was not admitted: ${JSON.stringify(admission)}`);
  const entry: AgenticaOperationEntry = { request: launch.acceptedStart, action, admission, activeEpoch: action.sessionEpoch,
    state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 0 } };
  source = { binding, action, guard: launch.guard.id };
  return { funded, binding, action, entry, actor, target, sight, guard: launch.guard.id };
}

export async function attach() {
  if (!source || driver) throw Error('Expected one offline operation driver');
  const forbidden = async () => { forbiddenCalls++; throw Error('Endurance delivery cannot invoke cognition or host actions'); };
  const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5474/api/host', onAction: forbidden, loadAction: forbidden, saveAction: forbidden,
    maxActions: 512 });
  driver = await createGameOperationDriver(session(), sdk, source.action, source.binding);
}
export async function pulse() {
  if (!driver) throw Error('No active driver');
  return driver.pulse();
}
export async function operation() {
  if (!source) throw Error('No original action');
  return (await readAgenticaOperation(await prepareAction(source.action))).value;
}
export async function finish() {
  if (!driver || !source) throw Error('No active host window');
  const cancelled = [];
  await driver.cancel();
  for (let n = 0; n < 8; n++) {
    const result = await driver.pulse(); cancelled.push(result);
    if (result.status === 'terminal-acknowledged') break;
    if (n === 7) throw Error('Offline child cleanup exceeded eight pulses');
  }
  const recovery = createControllerRootRecovery(session(), source.guard), stopped = await recovery.stop(), entry = await recovery.entry();
  entry.terminal!.usage = { steps: 1, refinements: 0, continuations: 0, providerCalls: 0 };
  const acknowledged = await recovery.acknowledge(entry);
  return { cancelled, stopped, acknowledged, state: await recovery.state(), forbiddenCalls };
}
export function close() { driver?.close(); driver = undefined; release?.(); release = undefined; }

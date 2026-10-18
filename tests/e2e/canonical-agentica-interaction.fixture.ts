import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { AgenticaHost, actionFingerprint, actionKey, type AgenticaOperationEntry, type HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readInteraction, readInteractionTerminal } from '../../src/persistence/canonical/interaction/commands';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { bytes, fundLaunch, startGame } from './canonical-agentica-actions.setup';
import { dump, refusal } from './canonical-frontier.support';
import { effects, seedChest } from './canonical-agentica-interaction.seed';
import * as commands from './canonical-agentica-interaction.commands';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5294') throw Error('Isolated Agentica interaction fixture only');
let session: Awaited<ReturnType<typeof startGame>> | undefined;
let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
let hooks: ReturnType<typeof createGameActionHooks> | undefined;
let binding: ActionBinding | undefined;

async function boot() {
  await seedChest(); session = await startGame();
  const funded = await fundLaunch(session), launch = (await readLaunch()).value!;
  binding = { grant: launch.grant!.ref, publication: funded.publication };
  hooks = createGameActionHooks(session, binding);
  return { binding, launchGuard: launch.guard.id, observation: funded.start.observation };
}
async function action(capabilityId: string, args: Record<string, unknown>, changes: Partial<AgenticaAction> = {}): Promise<AgenticaAction> {
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  return { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId, arguments: structuredClone(args), expectedRevision: launch.publication.wireRevision,
    deadlineAt: new Date(Date.now() + 300_000).toISOString(), ...changes };
}
async function reserve(original: AgenticaAction) {
  await hooks!.saveAction!(actionKey(original), { fingerprint: actionFingerprint(original), status: 'pending' });
}
async function perform(original: AgenticaAction) { return hooks!.onAction!(original); }
async function dispatch(original: AgenticaAction) { await reserve(original); return perform(original); }
async function inspectCurrent() {
  // The planner gets its address from the retained public actor view, not host seed data.
  const actor = (await readLaunch()).value!.acceptedStart.observation.data.actor as Record<string, unknown>;
  const original = await action('maze.inspect', { scope: 'cell', level: actor.level, spaceId: actor.spaceId,
    row: actor.row, column: actor.column });
  return { action: original, result: await dispatch(original) };
}
async function parkedEntry(original: AgenticaAction, admission: AgenticaResult): Promise<AgenticaOperationEntry> {
  if (!admission.operation) throw Error(`Missing interaction admission: ${JSON.stringify(admission)}`);
  return { request: structuredClone((await readLaunch()).value!.acceptedStart), action: original, admission,
    activeEpoch: original.sessionEpoch, state: 'parked',
    usage: { steps: 2, refinements: 0, continuations: 0, providerCalls: 0 } };
}
async function admit(target: string) {
  const original = await action('maze.interact', { target }), admission = await dispatch(original);
  return { action: original, admission, binding: binding!, entry: await parkedEntry(original, admission),
    operationId: admission.operation!.operationId };
}
async function selectChest() {
  const inspected = await inspectCurrent();
  const cell = inspected.result.observation?.data.cell as { chests?: { opened: boolean; target?: string }[] } | undefined;
  const candidates = cell?.chests?.filter(chest => !chest.opened && typeof chest.target === 'string') ?? [];
  if (candidates.length !== 1) throw Error('Planner requires one explicitly disclosed current-cell chest');
  return { ...inspected, target: candidates[0].target! };
}
function offlineSdk() {
  const forbidden = async () => { throw Error('Operation delivery attempted cognition or action execution'); };
  return new AgenticaHost({ url: 'ws://127.0.0.1:5294/api/host', onAction: forbidden,
    loadAction: forbidden, saveAction: forbidden, maxActions: 512 });
}
async function attachDriver(original: AgenticaAction, originalBinding: ActionBinding) {
  driver = await createGameOperationDriver(session!, offlineSdk(), original, originalBinding);
}
async function resume(originalBinding: ActionBinding) {
  session = await startGame(); binding = structuredClone(originalBinding);
  hooks = createGameActionHooks(session, binding);
}
const api = { ...commands, boot, action, reserve, perform, dispatch, inspectCurrent, selectChest, admit, parkedEntry, attachDriver, resume,
  effects, dump, refusal, bytes, readCanonicalHead, readInteraction, readInteractionTerminal,
  async retained(original: AgenticaAction) { const identity = await prepareAction(original); return readCanonical(p => readAction(p, identity)); },
  async operation(original: AgenticaAction) { return readAgenticaOperation(await prepareAction(original)); },
  async terminal(original: AgenticaAction, originalBinding: ActionBinding) { return readAgenticaTerminal(await prepareAction(original), originalBinding); },
  pulse: () => driver!.pulse(), cancel: () => driver!.cancel(), closeDriver: () => driver?.close(),
  signalProgress: (event: HostOperationEvent) => offlineSdk().signalOperation(event),
  look: () => session!.execute('exploration', { kind: 'look' }),
  async reserveWithBinding(original: AgenticaAction, supplied: ActionBinding) {
    const other = createGameActionHooks(session!, supplied);
    await other.saveAction!(actionKey(original), { fingerprint: actionFingerprint(original), status: 'pending' });
  },
  status: () => ({ controlled: session!.view.controlled, recoveryRequired: session!.view.recoveryRequired }),
  stop() { driver?.close(); session?.stop(); },
};
declare global { interface Window { canonicalAgenticaInteraction: typeof api } }
window.canonicalAgenticaInteraction = api;

import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { AgenticaHost, actionKey, actionFingerprint, type AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import type { ActionResult } from '../../src/persistence/canonical/agentica/types';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { readDestination } from '../../src/persistence/canonical/navigation/commands';
import { bytes, earnedTargets, fundLaunch, startGame } from './canonical-agentica-actions.setup';
import * as lifetime from './canonical-agentica-actions.lifetime';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5236') throw Error('Isolated action fixture origin required');

type Session = Awaited<ReturnType<typeof startGame>>;
type Hooks = ReturnType<typeof createGameActionHooks>;
type OfflineSdk = { runs: Map<string, unknown>; socket: { readyState: number; send(text: string): void } | null;
  _action(message: { type: string; runId: string; payload: AgenticaAction }): Promise<void> };
let session: Session | undefined, hooks: Hooks | undefined, sdk: OfflineSdk | undefined;
let invocations = 0;
const sent: AgenticaMessage[] = [], statuses: { state: string; detail?: unknown }[] = [], pendingAtInvocation: boolean[] = [];

async function attach() {
  const launch = (await readLaunch()).value!;
  hooks = createGameActionHooks(session!, { grant: launch.grant!.ref, publication: launch.binding.publication });
  const selected = hooks;
  // Pinned SDK offline _action precedent: src/persistence/agenticaSdk.browser.ts.
  sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5236/offline-only', ...selected,
    onAction: async action => {
      invocations++;
      const pending = await selected.loadAction!(actionKey(action));
      pendingAtInvocation.push(pending?.status === 'pending');
      return selected.onAction!(action);
    }, onStatus: status => statuses.push(status) }) as unknown as OfflineSdk;
  sdk.runs.set(launch.run!.value.data.started.runId, { ...launch.binding.start, ...launch.run!.value.data.started });
  sdk.socket = { readyState: 1, send: text => sent.push(JSON.parse(text) as AgenticaMessage) };
}
async function boot() {
  session = await startGame();
  const funded = await fundLaunch(session);
  await attach();
  return { ...funded, ...earnedTargets(session), head: (await readCanonicalHead()).head,
    source: session.view.game!.checkpoint.knowledge!, rawObservationBytes: bytes(session.view.game!.observation),
    sizes: { start: bytes(funded.start), binding: bytes(funded.binding), observation: bytes(funded.start.observation),
      capabilities: bytes(funded.start.capabilities) } };
}
async function resume() {
  session = await startGame(); await attach();
  return (await readCanonicalHead()).head;
}
async function action(capabilityId: string, args: Record<string, unknown> = {}): Promise<AgenticaAction> {
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  return { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId, arguments: args, expectedRevision: launch.publication.wireRevision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
}
async function retained(action: AgenticaAction) {
  const identity = await prepareAction(action);
  return (await readCanonical(async pages => {
    const value = await readAction(pages, identity);
    if (!value?.resultReference) return { value, proof: null };
    const row = (await pages.get('execution', value.resultReference.key))!;
    const result = row.value as unknown as ActionResult;
    return { value, proof: { row, ...await pages.sourceReceipt(result.sourceAttemptId) } };
  })).value;
}
async function dispatch(action: AgenticaAction, kind: 'action.request' | 'action.reconcile' = 'action.request') {
  const before = sent.length;
  await sdk!._action({ type: kind, runId: action.runId, payload: action });
  if (sent.length !== before + 1) throw Error('SDK must emit one exact action reply');
  return sent.at(-1)!.payload as AgenticaResult;
}
async function reserve(action: AgenticaAction) {
  await hooks!.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  return retained(action);
}
const api = { boot, resume, action, dispatch, retained, reserve, bytes, lifetime,
  async head() { return (await readCanonicalHead()).head; },
  async destination(id: string) { return (await readDestination(id)).value; },
  async launch() { return (await readLaunch()).value; },
  async flush() { await session!.flush(); return session!.view; },
  async direct(action: AgenticaAction) { return hooks!.onAction!(action); },
  trace() { return { invocations, statuses, pendingAtInvocation, sent }; },
  stop() { session?.stop(); if (sdk) sdk.socket = null; },
};
declare global { interface Window { canonicalAgenticaActions: typeof api } }
window.canonicalAgenticaActions = api;

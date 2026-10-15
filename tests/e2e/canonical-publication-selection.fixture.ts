import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { publishGamePublication, renewGamePublication } from '../../src/services/agentica/game/publication';
import { readPublication } from '../../src/persistence/canonical/agentica/publication';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { fundLaunch, startGame } from './canonical-agentica-actions.setup';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5242') throw Error('Isolated publication selection fixture only');
let session: Awaited<ReturnType<typeof startGame>>;
let launchId: string;
const retainedHooks = new Map<string, ReturnType<typeof createGameActionHooks>>();
const hooks = (binding: ActionBinding) => {
  const key = JSON.stringify(binding);
  if (!retainedHooks.has(key)) retainedHooks.set(key, createGameActionHooks(session, binding));
  return retainedHooks.get(key)!;
};
const selected = () => readCanonical(pages => readPublicationSelection(pages, launchId));
async function boot() {
  session = await startGame(); const launch = await fundLaunch(session); launchId = launch.launchId;
  const value = (await readLaunch(launchId)).value!;
  return { launchId, binding: { grant: value.grant!.ref, publication: launch.publication }, selection: (await selected()).value };
}
async function renew(publication: ProtocolRef) {
  const before = (await selected()).value!;
  await renewGamePublication(session, { launchId, grant: before.value.data.grant, publication, previousSelection: before.ref });
  return (await selected()).value!;
}
async function action(binding: ActionBinding): Promise<AgenticaAction> {
  const launch = (await readLaunch(launchId)).value!, run = launch.run!.value.data.started;
  const publication = (await readCanonical(pages => readPublication(pages, binding.publication))).value;
  return { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.observe', arguments: {}, expectedRevision: publication.wireRevision, deadlineAt: '2099-01-01T00:00:00.000Z' };
}
async function dump() {
  const db = await openCanonicalDatabase();
  try { const tx = db.transaction(CANONICAL_STORES, 'readonly'), result = [];
    for (const store of CANONICAL_STORES) result.push([store, await tx.objectStore(store).getAll()]);
    await tx.done; return JSON.stringify(result);
  } finally { db.close(); }
}
async function replayWithoutWriter(binding: ActionBinding, action: AgenticaAction) {
  const writes: string[] = [];
  const cold = createGameActionHooks({ hostSignal: new AbortController().signal, async submitHostCommand(command) {
    writes.push(command.kind); throw Error('Read attempted authority');
  } }, binding);
  return { loaded: await cold.loadAction!(actionKey(action)), reconciled: await cold.reconcileAction!(action, null),
    effect: await cold.onAction!(action), writes };
}
const api = { boot, selected, renew, action, dump, replayWithoutWriter,
  publish: () => publishGamePublication(session), head: () => readCanonicalHead(),
  changeWorld: () => session.execute('settings', { kind: 'throttle', ms: 600 }),
  reserve: (binding: ActionBinding, action: AgenticaAction) => hooks(binding).saveAction!(actionKey(action),
    { fingerprint: actionFingerprint(action), status: 'pending' }),
  effect: (binding: ActionBinding, action: AgenticaAction) => hooks(binding).onAction!(action),
  stop: () => session?.stop() };
declare global { interface Window { publicationSelection: typeof api } }
window.publicationSelection = api;

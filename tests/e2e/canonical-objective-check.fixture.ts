import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionResult, type ActionBinding } from '../../src/services/agentica/game/actionContract';
import { queryObjective } from '../../src/services/agentica/game/objectiveContext';
import { prepareAction, retainActionResult } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readPublication } from '../../src/persistence/canonical/agentica/publication';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { readCanonical, readCanonicalHead, snapshotOf } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { setup, renew, collectAndReturn, stash } from './canonical-objective-check.setup';
import { guarded, retained, damage, type Access } from './canonical-objective-check.probes';
import { startGame } from './canonical-agentica-actions.setup';
import { domainState } from './canonical-agentica-quests.setup';
import { dump, refusal } from './canonical-frontier.support';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5266') throw Error('Isolated native fixture only');
let seeded: Awaited<ReturnType<typeof setup>> | undefined, session: Awaited<ReturnType<typeof startGame>>;
let hooks: ReturnType<typeof createGameActionHooks>, binding: ActionBinding;
async function attach() {
  const launch = (await readLaunch()).value!;
  const selected = (await readCanonical(pages => readPublicationSelection(pages, launch.binding.launchId))).value!;
  binding = { publication: selected.value.data.publication, grant: selected.value.data.grant };
  hooks = createGameActionHooks(session, binding);
}
async function boot(mode: Parameters<typeof setup>[0] = 'pending') {
  seeded = await setup(mode); session = seeded.session; await attach();
  return { root: seeded.root, questId: seeded.questId, route: seeded.route, binding,
    objectiveId: seeded.launch.binding.start.objectiveId, head: (await readCanonicalHead()).head };
}
async function action(capabilityId = 'maze.inspect', args: Record<string, unknown> = { scope: 'objective' }): Promise<AgenticaAction> {
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  const publication = (await readCanonical(pages => readPublication(pages, binding.publication))).value;
  return { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId, arguments: args, expectedRevision: publication.wireRevision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
}
async function reserve(original: AgenticaAction) {
  return hooks.saveAction!(actionKey(original), { fingerprint: actionFingerprint(original), status: 'pending' });
}
async function check(probe = false) {
  const original = await action(), identity = await prepareAction(original), accesses: Access[] = [];
  await reserve(original);
  if (probe) await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.action.resolve', input: { action: identity.storageKey },
    execute: (request, options) => executeCanonical(request, async tx => {
      const measured = { ...tx, pages: guarded(tx.pages, seeded!.questId, accesses) };
      const checked = await queryObjective(measured, identity, binding);
      return (await retainActionResult(measured, request, identity, checked.result, undefined, checked.proof)).receipt;
    }, options) });
  const result = await hooks.onAction!(original);
  return { original, result, retained: await retained(original), accesses };
}
async function forge(kind: 'cloned' | 'mutated' | 'false-completion' | 'arbitrary' | 'observe') {
  const original = await action(kind === 'observe' ? 'maze.observe' : 'maze.inspect', kind === 'observe' ? {} : { scope: 'objective' });
  await reserve(original);
  const identity = await prepareAction(original), { head } = await readCanonicalHead();
  const request = gameRequest(head, 'agentica.action.resolve', { action: identity.storageKey }), before = await dump();
  const result = await refusal(() => executeCanonical(request, async tx => {
    if (kind === 'observe') {
      const observation = await observeMaze(tx.pages, snapshotOf(tx.head), binding.publication);
      const result = actionResult(identity, observation, 'Ordinary observation.');
      result.completion = { objectiveId: 'arbitrary-objective', evidenceId: result.evidenceId, summary: 'Forged completion.' };
      return (await retainActionResult(tx, request, identity, result)).receipt;
    }
    const checked = await queryObjective(tx, identity, binding);
    const proof = kind === 'cloned' ? structuredClone(checked.proof) : checked.proof;
    if (kind === 'mutated') proof.evidence.quest.status = 'claimed';
    if (kind === 'false-completion' || kind === 'arbitrary')
      checked.result.completion = { objectiveId: seeded!.launch.binding.start.objectiveId, evidenceId: checked.result.evidenceId, summary: 'Forged completion.' };
    return (await retainActionResult(tx, request, identity, checked.result, undefined, kind === 'arbitrary' ? undefined : proof)).receipt;
  }));
  return { before, result, after: await dump() };
}
const api = {
  boot, action, reserve, check, forge, retained, damage, domainState, dump, refusal,
  async fingerprint(domain = false) {
    const serialized = domain ? JSON.stringify(await domainState()) : await dump();
    const bytes = new TextEncoder().encode(serialized);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return { bytes: bytes.length, sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') };
  },
  async collect() {
    if (!seeded?.route) throw Error('No ordinary manual route');
    const result = await collectAndReturn(session, seeded.route); await renew(session); await attach(); return result;
  },
  async stash() { await stash(session, seeded!.questId); await renew(session); await attach(); return domainState(); },
  async renew() { await renew(session); await attach(); return binding; },
  async resume() { session = await startGame(); await attach(); return (await readCanonicalHead()).head; },
  perform: (original: AgenticaAction) => hooks.onAction!(original),
  stop() { session?.stop(); },
};
declare global { interface Window { canonicalObjectiveCheck: typeof api } }
window.canonicalObjectiveCheck = api;

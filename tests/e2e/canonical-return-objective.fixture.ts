import type { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import type { CanonicalRequest, JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { retainPublication, readPublication } from '../../src/persistence/canonical/agentica/publication';
import { assertLaunchGrant, createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { executePublicationRenewal, readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { launchStartFixture, launchProofFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { prepareGameLaunch, type GameLaunchOptions } from '../../src/services/agentica/game/launch';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import { checkpointJson, gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { startGame } from './canonical-agentica-actions.setup';
import { domainState, seedJournal } from './canonical-agentica-quests.setup';
import { dump, refusal } from './canonical-frontier.support';
import * as content from './canonical-content-fixture';
import { boundedPages, nativeState, originalSight, proof, removeEntranceEvidence, selection, type Access } from './canonical-return-objective.support';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5266') throw Error('Isolated native fixture only');
let session: GameSession | undefined, questId = '';
async function boot(kind: 'fetch' | 'other' | 'none' = 'fetch') {
  const seed = await seedJournal({ accept: 0 }); session = seed.session;
  const offered = seed.offers.find(q => kind === 'other' ? q.task.objective !== 'fetch'
    : q.task.objective === 'fetch' && q.task.required === 1 && q.task.item);
  if (!offered) throw Error(`Missing generated ${kind} offer`);
  questId = offered.id;
  const receipts = [];
  if (kind !== 'none') {
    await session.execute('exploration', { kind: 'stairs', direction: 'up' });
    receipts.push(await session.execute('content', { kind: 'accept-quest', contractId: questId }));
    await session.execute('roster', { kind: 'leave-town' });
  }
  return { questId, offered, receipts, accepted: session.view.game!.quests, sight: await originalSight(),
    head: (await readCanonicalHead()).head };
}
function choice(id = questId): { launchId: string; objectiveId: string; questId: string } {
  return { launchId: crypto.randomUUID(), objectiveId: crypto.randomUUID(), questId: id };
}
async function publish(goal = choice(), mutateAliases = false, ordinary = false, abort = false) {
  let original!: CanonicalRequest;
  const reads: Access[] = [];
  const receipt = await session!.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish',
    input: ordinary ? {} : { returnQuest: goal },
    execute: (request, options) => {
      original = structuredClone(request);
      return executeCanonical(request, async tx => {
        const caller = structuredClone(request);
        const pages = boundedPages(tx.pages, goal.questId, reads, () => {
          if (mutateAliases) {
            selection(caller).questId = 'caller-mutated-quest';
            selection(caller).objectiveId = 'caller-mutated-objective';
            (tx.head.checkpoint.position as JsonObject).level = 99;
          }
        });
        const result = await retainPublication({ ...tx, pages }, caller);
        if (abort) throw Error('Fixture abort after binding and publication staging');
        return result.receipt;
      }, options);
    } });
  const ref = (receipt.result as JsonObject).reference as unknown as ProtocolRef;
  return { goal, original, receipt, ref, reads, proof: await proof(ref) };
}
async function prepare(mutateAliases = false, id = questId) {
  const fixture = launchStartFixture(), launchId = crypto.randomUUID();
  const config: GameLaunchOptions = { endpoint: 'ws://127.0.0.1:5266/offline-only', objectiveId: crypto.randomUUID(),
    objective: 'Retrieve the selected accepted item and return to the earned entrance.',
    returnQuestId: id, provider: fixture.provider, limits: fixture.limits };
  const expected = structuredClone(config);
  let first = true;
  const port: CanonicalHostPort = { hostSignal: session!.hostSignal, submitHostCommand(command) {
    const pending = session!.submitHostCommand(command);
    if (first && mutateAliases) {
      first = false; config.returnQuestId = 'caller-mutated-quest'; config.objectiveId = 'caller-mutated-objective';
      config.provider.provider = 'openai'; config.limits.maxSteps = 999;
    }
    return pending;
  } };
  const prepared = await prepareGameLaunch(port, config, launchId);
  return { expected, prepared, proof: await proof(prepared.publication), launch: (await readLaunch()).value };
}
async function admit(ref: ProtocolRef, launchId: string, objectiveId: string) {
  const { head } = await readCanonicalHead();
  const observation = (await readCanonical((pages, snapshot) => observeMaze(pages, snapshot, ref))).value;
  const start = { ...launchStartFixture(observation.revision, String(head.epoch)), sessionId: launchSessionId(head.gameId, launchId),
    scopeId: launchId, objectiveId, observation, capabilities: mazeCapabilities() };
  const binding = createLaunchBinding({ launchId, endpoint: 'ws://127.0.0.1:5266/offline-only', publication: ref, start });
  return session!.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: launchGuardId(launchId), binding, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }, execute: executeLaunchCommand });
}
async function grant() {
  const current = (await readLaunch()).value!;
  const { launchId, start, publication } = current.binding;
  await session!.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  const reply = launchProofFixture(start, dispatched.dispatch!.source.attemptId, crypto.randomUUID());
  await session!.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref }, ...reply }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session!.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
  return (await readLaunch()).value!;
}
async function renew(ref: ProtocolRef) {
  const current = (await readLaunch()).value!, launchId = current.binding.launchId;
  const selected = (await readCanonical(pages => readPublicationSelection(pages, launchId))).value!;
  return session!.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication.renew',
    input: { launchId, grant: { ...current.grant!.ref }, publication: { ...ref }, previousSelection: { ...selected.ref } },
    execute: executePublicationRenewal });
}
async function rootObjective(ref: ProtocolRef) {
  const current = (await readLaunch()).value!, started = current.run!.value.data.started;
  const { head } = await readCanonicalHead(), publication = await proof(ref);
  return (await readCanonical(pages => assertLaunchGrant({ head, pages, liveOperation: pages.liveOperation }, current.grant!.ref,
    { actionId: crypto.randomUUID(), runId: started.runId, runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
      sessionId: started.sessionId, sessionEpoch: started.sessionEpoch, capabilityId: 'maze.observe', manifestHash: started.manifestHash,
      arguments: {}, expectedRevision: publication.publication.wireRevision, deadlineAt: new Date(Date.now() + 30_000).toISOString() }, ref))).value;
}
async function wrongLevel() {
  await content.work(async tx => {
    const checkpoint = gameCheckpoint(tx.head.checkpoint);
    tx.setCheckpoint(checkpointJson({ ...checkpoint, position: { ...checkpoint.position, level: 2 } })); return {};
  });
}
async function publishDirect() {
  const { head } = await readCanonicalHead(), request = gameRequest(head, 'agentica.publish', { returnQuest: choice() });
  return executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt);
}
async function mutateQuest() {
  await content.work(async tx => {
    const contract = await content.records.loadContract(tx.pages, questId);
    const quest = await content.records.loadAcceptedQuest(tx.pages, contract);
    if (!quest) throw Error('Missing selected accepted quest');
    const title = 'Changed after publication';
    await content.records.saveContract(tx.pages, { ...contract, contract: { ...contract.contract, title } });
    await content.records.saveQuest(tx.pages, { ...quest, quest: { ...quest.quest, title } }); return {};
  });
  await session!.refresh();
}
async function changeQuestShape(defect: 'floor' | 'multiple') {
  await content.work(async tx => {
    const contract = await content.records.loadContract(tx.pages, questId);
    const quest = await content.records.loadAcceptedQuest(tx.pages, contract);
    if (!quest) throw Error('Missing selected accepted quest');
    if (defect === 'floor') contract.contract.floor = quest.quest.floor = 2;
    else contract.contract.task.required = quest.quest.task.required = 2;
    await content.records.saveContract(tx.pages, contract); await content.records.saveQuest(tx.pages, quest); return {};
  });
}
const api = {
  boot, choice, publish, prepare, admit, grant, renew, rootObjective, wrongLevel, publishDirect, mutateQuest, changeQuestShape,
  proof, nativeState, domainState, dump, refusal, removeEntranceEvidence,
  async read(ref: ProtocolRef) {
    const first = (await readCanonical(pages => readPublication(pages, ref))).value;
    if (first.objective) { first.objective.quest.title = 'Returned alias changed'; first.objective.entrance.at.cell.row = 999; }
    return proof(ref);
  },
  async resume() { session = await startGame(); return (await readCanonicalHead()).head; },
  async replay(request: CanonicalRequest) {
    let calls = 0, replayed = false;
    const receipt = await session!.submitHostCommand({ kind: 'retry', request, execute: async (original, options) => {
      const result = await executeCanonical(original, async () => { calls++; throw Error('Original must not execute again'); }, options);
      replayed = result.replayed; return result;
    } });
    return { receipt, calls, replayed };
  },
  stop() { session?.stop(); },
};
declare global { interface Window { canonicalReturnObjective: typeof api } }
window.canonicalReturnObjective = api;

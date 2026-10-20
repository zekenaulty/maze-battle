import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { GameSession } from '../../src/services/game/GameSession';
import type { QuestState } from '../../src/domain/types';
import type { ActionResult, ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchStartFixture, launchProofFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/persistence/canonical/game/settings';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../src/persistence/canonical/types';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import { startGame } from './canonical-agentica-actions.setup';
import * as roster from './canonical-roster-fixture';
import * as content from './canonical-content-fixture';
import * as knowledge from './canonical-knowledge-fixture';

export interface SetupOptions { text?: 'paged' | 'oversized-detail'; accept?: number; oldManifest?: boolean }

/** Authored world setup only. Acceptance itself always uses the actual GameSession content command. */
export async function seedJournal(options: SetupOptions = {}) {
  await roster.seed(); await content.prepare();
  await content.work(async tx => {
    await tx.pages.set('world', SETTINGS_KEY, DEFAULT_SETTINGS);
    await tx.pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'ready' });
    return {};
  });
  if (options.text) {
    const targets = await content.targets();
    for (const [i, target] of targets.entries()) {
      if (!target.contract) continue;
      const contract = structuredClone(target.contract);
      contract.contract.title = `${i}:` + '\u754c'.repeat(158);
      contract.contract.task.noun = '\u754c'.repeat(160);
      if (options.text === 'oversized-detail') {
        contract.contract.description = '\u754c'.repeat(512);
        contract.contract.targetRoomName = '\u754c'.repeat(160);
      }
      await content.work(async tx => { await content.records.saveContract(tx.pages, contract); return {}; });
    }
  }
  await knowledge.act({ kind: 'look' });
  const session = await startGame();
  const town = await session.execute('exploration', { kind: 'stairs', direction: 'up' });
  if (session.view.game?.mode !== 'town') throw Error('Expected ordinary floor-one stairs to enter town');
  const offers = structuredClone(session.view.game.contracts);
  if (offers.length <= 4) throw Error('Fixture requires more than four generated guild offers');
  const receipts = [];
  for (const offer of offers.slice(0, options.accept ?? offers.length))
    receipts.push(await session.execute('content', { kind: 'accept-quest', contractId: offer.id }));
  const accepted = structuredClone(session.view.game.quests);
  await session.execute('roster', { kind: 'leave-town' });
  return { session, offers, accepted, receipts, town };
}

export async function fundJournal(session: GameSession, oldManifest = false) {
  const head = (await readCanonicalHead()).head;
  const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input: {},
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  const publication = (receipt.result as JsonObject).reference as unknown as ProtocolRef;
  const observation = (await readCanonical((pages, snapshot) => observeMaze(pages, snapshot, publication))).value;
  const capabilities = mazeCapabilities();
  if (oldManifest) {
    const inspect = capabilities.find(capability => capability.id === 'maze.inspect')!;
    inspect.inputSchema.fields = inspect.inputSchema.fields.filter(field => !['status', 'target'].includes(field.name));
    inspect.inputSchema.fields.find(field => field.name === 'scope')!.allowedValues = ['room', 'map', 'cell', 'frontiers'];
  }
  const launchId = crypto.randomUUID(), start = { ...launchStartFixture(observation.revision, String(head.epoch)),
    sessionId: launchSessionId(head.gameId, launchId), scopeId: launchId, objectiveId: crypto.randomUUID(),
    objective: 'Read only the explicitly selected accepted quest page.', observation, capabilities,
    limits: { ...launchStartFixture().limits, maxSteps: 64 } };
  const binding = createLaunchBinding({ launchId, endpoint: 'ws://127.0.0.1:5295/offline-only', publication, start });
  await session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: launchGuardId(launchId), binding, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }, execute: executeLaunchCommand });
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  const proof = launchProofFixture(start, dispatched.dispatch!.source.attemptId, crypto.randomUUID());
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref }, ...proof }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication }, execute: executeLaunchCommand });
  return { publication, start, guard: launchGuardId(launchId) };
}

/** Raw domain-store oracle: no reuse of the runtime quest DTO or accepted reader. */
export async function domainState() {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    const rows = await db.getAll('records');
    return { gameId: head.gameId, generation: head.generation, roots: { world: head.roots.world, knowledge: head.roots.knowledge },
      checkpoint: head.checkpoint, records: rows.filter(row => row.gameId === head.gameId && row.area !== 'execution') };
  } finally { db.close(); }
}
export async function journalRows() {
  return (await readCanonical(async (pages, snapshot) => {
    const rows: QuestState[] = [];
    const floor = (snapshot.checkpoint.position as JsonObject).level as number;
    for (const status of ['active', 'complete', 'claimed']) {
      const page = await pages.scan('world', `quests/floor/${floor}/${status}/`, undefined, 16);
      if (page.next) throw Error('Fixture oracle exceeds its bounded generated corpus');
      for (const row of page.rows) rows.push((row.value as unknown as { quest: QuestState }).quest);
    }
    return rows;
  })).value;
}
export async function retained(action: AgenticaAction) {
  const identity = await prepareAction(action);
  return (await readCanonical(async pages => {
    const value = await readAction(pages, identity);
    if (!value?.resultReference) return { value, proof: null };
    const row = (await pages.get('execution', value.resultReference.key))!;
    const result = row.value as unknown as ActionResult;
    return { value, proof: { row, ...await pages.sourceReceipt(result.sourceAttemptId) } };
  })).value;
}
export async function exhaustQuota() {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId);
  } finally { db.close(); }
  return head;
}
export async function removeEvidence(action: AgenticaAction, kind: 'publication' | 'original' | 'result' | 'mapping') {
  const state = await retained(action);
  if (!state.value || !state.proof) throw Error('Corruption needs a completed original');
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    if (kind === 'mapping') {
      const row = structuredClone(state.proof.row);
      const value = row.value as JsonObject, query = value.query as JsonObject;
      (query.rows as JsonObject[])[0].id = crypto.randomUUID();
      await db.put('records', row, [head.gameId, row.id]);
    } else {
      const id = kind === 'publication' ? state.value.publication.sourceAttemptId
        : kind === 'original' ? state.value.original.sourceAttemptId : state.proof.source.attemptId;
      await db.delete('receipts', [head.gameId, id]);
    }
  } finally { db.close(); }
}
export async function renameAccepted() {
  const rows = await journalRows(), chosen = rows[0];
  await content.work(async tx => {
    const contract = await content.records.loadContract(tx.pages, chosen.id);
    const quest = await content.records.loadAcceptedQuest(tx.pages, contract);
    if (!quest) throw Error('Missing accepted setup quest');
    const title = `Changed journal: ${chosen.title}`;
    await content.records.saveContract(tx.pages, { ...contract, contract: { ...contract.contract, title } });
    await content.records.saveQuest(tx.pages, { ...quest, quest: { ...quest.quest, title } });
    return {};
  });
  return chosen.id;
}

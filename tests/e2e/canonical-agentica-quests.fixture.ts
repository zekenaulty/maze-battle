import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import type { QuestStatus } from '../../src/domain/types';
import { AgenticaHost, actionFingerprint, actionKey, type AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { queryQuests } from '../../src/services/agentica/game/questContext';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { bytes, startGame } from './canonical-agentica-actions.setup';
import { dump, refusal } from './canonical-frontier.support';
import { seedJournal, fundJournal, domainState, journalRows, retained, exhaustQuota, removeEvidence,
  renameAccepted, type SetupOptions } from './canonical-agentica-quests.setup';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5295') throw Error('Isolated quest fixture origin required');

export interface PublicQuest {
  target: string; title: string; status: QuestStatus;
  task: { objective: string; noun: string; required: number; progress: number; itemName?: string; monsterTags?: string[] };
  reward: { gold: number };
  description?: string; targetName?: string; acceptedAt?: string; completedAt?: string; claimedAt?: string;
}
export interface QuestPage { scope: 'quests'; floor: number; status: QuestStatus; quests: PublicQuest[]; next?: string }
export interface QuestDetail { scope: 'quest'; floor: number; quest: PublicQuest }
type OfflineSdk = { runs: Map<string, unknown>; socket: { readyState: number; send(text: string): void } | null;
  _action(message: { type: string; runId: string; payload: AgenticaAction }): Promise<void> };
let session: Awaited<ReturnType<typeof startGame>> | undefined;
let hooks: ReturnType<typeof createGameActionHooks> | undefined, binding: ActionBinding | undefined;
let sdk: OfflineSdk | undefined, invocations = 0, dropReply = false;
const sent: AgenticaMessage[] = [], lost: AgenticaMessage[] = [];

async function attach() {
  const launch = (await readLaunch()).value!;
  binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
  hooks = createGameActionHooks(session!, binding);
  const selected = hooks;
  // Same pinned offline SDK seam as canonical-agentica-actions.fixture; never connect/start a socket.
  sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5295/offline-only', ...selected,
    onAction: async action => { invocations++; return selected.onAction!(action); },
  }) as unknown as OfflineSdk;
  sdk.runs.set(launch.run!.value.data.started.runId, { ...launch.binding.start, ...launch.run!.value.data.started });
  sdk.socket = { readyState: 1, send(text) {
    const frame = JSON.parse(text) as AgenticaMessage;
    (dropReply ? lost : sent).push(frame); dropReply = false;
  } };
}
async function boot(options: SetupOptions = {}) {
  const setup = await seedJournal(options); session = setup.session;
  const funded = await fundJournal(session, options.oldManifest);
  await attach();
  return { offers: setup.offers, accepted: setup.accepted, receipts: setup.receipts, town: setup.town,
    ...funded, binding: binding!, head: (await readCanonicalHead()).head };
}
async function resume() {
  session = await startGame(); await attach();
  return { head: (await readCanonicalHead()).head, binding: binding! };
}
async function action(args: Record<string, unknown>, changes: Partial<AgenticaAction> = {}): Promise<AgenticaAction> {
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  return { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.inspect', arguments: structuredClone(args), expectedRevision: launch.publication.wireRevision,
    deadlineAt: new Date(Date.now() + 300_000).toISOString(), ...changes };
}
async function reserve(original: AgenticaAction) {
  await hooks!.saveAction!(actionKey(original), { fingerprint: actionFingerprint(original), status: 'pending' });
}
async function dispatch(original: AgenticaAction, kind: 'action.request' | 'action.reconcile' = 'action.request') {
  const before = sent.length;
  await sdk!._action({ type: kind, runId: original.runId, payload: original });
  if (sent.length !== before + 1 || sent.at(-1)?.type !== 'action.result')
    throw Error(`Expected exactly one action.result, got ${JSON.stringify(sent.slice(before))}`);
  return sent.at(-1)!.payload as AgenticaResult;
}
async function list(status: QuestStatus = 'active', cursor?: string) {
  const original = await action({ scope: 'quests', status, ...(cursor === undefined ? {} : { cursor }) });
  const result = await dispatch(original);
  if (result.disposition !== 'applied' || result.observation?.data.scope !== 'quests') throw Error(JSON.stringify(result));
  return { action: original, result, data: result.observation.data as unknown as QuestPage };
}
async function detail(target: string) {
  const original = await action({ scope: 'quest', target }), result = await dispatch(original);
  if (result.disposition !== 'applied' || result.observation?.data.scope !== 'quest') throw Error(JSON.stringify(result));
  return { action: original, result, data: result.observation.data as unknown as QuestDetail };
}
async function allPages() {
  const pages: Awaited<ReturnType<typeof list>>[] = [], cursors = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 16; i++) {
    const page = await list('active', cursor); pages.push(page);
    cursor = page.data.next;
    if (cursor === undefined) return pages;
    if (cursors.has(cursor)) throw Error('Quest cursor repeated');
    cursors.add(cursor);
  }
  throw Error('Fixture stopped an unbounded quest traversal');
}
async function loseReply(original: AgenticaAction) {
  const before = sent.length, lostBefore = lost.length; dropReply = true;
  await sdk!._action({ type: 'action.request', runId: original.runId, payload: original });
  if (sent.length !== before || lost.length !== lostBefore + 1 || lost.at(-1)?.type !== 'action.result')
    throw Error('Expected one discarded successful action reply');
  return retained(original);
}

/** Boundary probe at real roots with real source receipts; separate from the full action-hook tests. */
async function guarded(original: AgenticaAction) {
  const identity = await prepareAction(original), accesses: { method: string; area: string; key: string; count?: number }[] = [];
  let worldBytes = 0;
  const result = await readCanonical(async (pages, snapshot) => queryQuests({
    async get(area, key) {
      accesses.push({ method: 'get', area, key });
      if (area === 'world' && !/^(quest|contract)\//.test(key)) throw Error('Quest query attempted hidden world lookup');
      const row = await pages.get(area, key);
      if (area === 'world' && row) worldBytes += bytes(row);
      return row;
    },
    async scan(area, prefix, after, count) {
      accesses.push({ method: 'scan', area, key: prefix, count });
      if (area !== 'world' || !/^quests\/floor\/1\/(active|complete|claimed)\/$/.test(prefix) || !count || count > 4)
        throw Error('Quest query attempted unbounded or foreign scan');
      const page = await pages.scan(area, prefix, after, count); worldBytes += bytes(page); return page;
    },
    savedSnapshot: pages.savedSnapshot, sourceReceipt: pages.sourceReceipt,
  }, snapshot, binding!, identity, original.arguments as Parameters<typeof queryQuests>[4]));
  return { ...result, accesses, worldBytes };
}
async function hiddenUnavailable(original: AgenticaAction) {
  const db = await openCanonicalDatabase();
  const rows = (await db.getAll('records')).filter(row => row.area === 'world' && row.key.startsWith('dungeon/'));
  if (!rows.length) { db.close(); throw Error('Missing independent hidden-world corruption targets'); }
  try {
    const tx = db.transaction('records', 'readwrite');
    for (const row of rows) await tx.store.delete([row.gameId, row.id]);
    await tx.done;
    return { removed: rows.length, result: await guarded(original) };
  } finally {
    const tx = db.transaction('records', 'readwrite');
    for (const row of rows) await tx.store.put(row, [row.gameId, row.id]);
    await tx.done; db.close();
  }
}
const api = {
  boot, resume, action, reserve, dispatch, list, detail, allPages, loseReply, guarded, hiddenUnavailable,
  domainState, journalRows, retained, exhaustQuota, removeEvidence, dump, refusal, bytes,
  perform: (original: AgenticaAction) => hooks!.onAction!(original),
  reconcile: (original: AgenticaAction) => hooks!.reconcileAction!(original, null),
  async mutateJournal() { const id = await renameAccepted(); await session!.refresh(); return id; },
  look: () => session!.execute('exploration', { kind: 'look' }),
  async head() { return (await readCanonicalHead()).head; },
  async reserveWithBinding(original: AgenticaAction, supplied: ActionBinding) {
    const other = createGameActionHooks(session!, supplied);
    return other.saveAction!(actionKey(original), { fingerprint: actionFingerprint(original), status: 'pending' });
  },
  trace: () => ({ invocations, sent: structuredClone(sent), lost: structuredClone(lost) }),
  stop() { session?.stop(); if (sdk) sdk.socket = null; },
};
declare global { interface Window { canonicalAgenticaQuests: typeof api } }
window.canonicalAgenticaQuests = api;

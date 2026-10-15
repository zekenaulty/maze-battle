import { retainDecisionIntent } from '../../src/persistence/canonical/agentica/decision';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { retainDecisionClaim, loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readLaunch, assertLaunchGrant } from '../../src/persistence/canonical/agentica/launch';
import { readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical, type CanonicalWork } from '../../src/persistence/canonical/transaction';
import { CANONICAL_STORES, type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { json } from '../../src/persistence/canonical/world/records';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import { canonicalJson, type AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { seedTransfer, type TransferSeed } from './canonical-operation-transfer.setup';
import { startGame } from './canonical-agentica-actions.setup';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';
import { draftNavigationWindow, seedNavigationWindow, type NavigationWindowSource } from './canonical-decision-window';
import { decisionReadCosts } from './canonical-decision-cost';
import { grantWindow, windowGrant, adoptWindowGuard, replayWindow } from './canonical-decision-grant';
import { seedRenewedPublicationWindow, deleteDecisionEvidence } from './canonical-decision-deletion';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5262') throw Error('Isolated decision fixture only');
let session: Awaited<ReturnType<typeof startGame>>, seed: TransferSeed;
const requests = new Map<string, CanonicalRequest>();
const writers = new Map<string, (tx: CanonicalWork, r: CanonicalRequest) => Promise<Json>>();
async function submit(operation: string, input: Json, work: (tx: CanonicalWork, r: CanonicalRequest) => Promise<Json>) {
  return session.submitHostCommand({ kind: 'fresh', operation, input, execute: (r, options) => {
    requests.set(operation, structuredClone(r)); writers.set(operation, work); return executeCanonical(r, tx => work(tx, r), options);
  } });
}
async function boot(renewPublication = false) {
  ({ session, seed } = renewPublication ? await seedRenewedPublicationWindow() : await seedTransfer());
  await confirmNavigation(session, seed); return seed;
}
async function state(original = seed) {
  const identity = await prepareAction(original.action), launch = (await readLaunch()).value!;
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value;
  const claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value;
  const terminal = (await readAgenticaTerminal(identity, original.binding)).value;
  return { head: (await readCanonicalHead()).head, launch,
    selection: (await readCanonical(p => readPublicationSelection(p, launch.binding.launchId))).value,
    operation: (await readAgenticaOperation(identity)).value,
    intent: intent && { reference: intent.reference, data: intent.data, source: intent.source, row: intent.row, publication: intent.publication },
    claim: claim && { reference: claim.reference, data: claim.data, source: claim.source, row: claim.row },
    terminal: terminal && { event: terminal.event, receipt: terminal.terminal.terminal.receipt, source: terminal.terminal.terminal.source } };
}
async function prepare(publication: ProtocolRef) {
  const identity = await prepareAction(seed.action), binding = seed.binding;
  return submit('agentica.operation.decision', json({ action: identity.storageKey, binding, publication }),
    async (tx, r) => (await retainDecisionIntent(tx, r, identity, binding, publication)).receipt);
}
export interface ClaimProof { intent: ProtocolRef; started: LaunchStarted; entry: AgenticaOperationEntry }
async function proof(): Promise<ClaimProof> {
  const s = await state(), d = s.intent!, runId = crypto.randomUUID(), epoch = d.data.adoption?.nextSessionEpoch ?? d.data.event.sessionEpoch;
  return { intent: d.reference, started: { ...s.launch.run!.value.data.started, runId, sessionEpoch: epoch },
    entry: { ...structuredClone(seed.entry), activeEpoch: epoch, state: 'waking', latestEvent: d.data.event,
      wakeRunId: runId, ...(d.data.adoption ? { wakeAdoption: d.data.adoption } : {}) } };
}
async function claim(p: ClaimProof, mutateAfterCall = false) {
  const identity = await prepareAction(seed.action);
  return submit('agentica.operation.decision-claim', json({ action: identity.storageKey, ...p }),
    async (tx, r) => {
      const callerRequest = structuredClone(r), pending = retainDecisionClaim(tx, callerRequest, identity, p.intent, p.started, p.entry);
      if (mutateAfterCall) {
        callerRequest.operation = 'fixture.changed'; callerRequest.input = {}; callerRequest.expected.owner = 'foreign';
        p.started.runId = 'foreign'; p.intent.id = 'foreign'; p.entry.wakeRunId = 'foreign';
      }
      return (await pending).receipt;
    });
}
async function replay(operation: string) {
  return executeCanonical(requests.get(operation)!, async () => { throw Error('Committed exact retry ran a writer'); });
}
async function retry(operation: string) {
  const request = requests.get(operation)!;
  return executeCanonical(request, tx => writers.get(operation)!(tx, request));
}
async function gate(p: ClaimProof) {
  const selected = (await state()).selection!, action = { ...seed.action, runId: p.started.runId, sessionEpoch: p.started.sessionEpoch };
  return submit('fixture.claimed-run', {}, async tx => {
    await assertLaunchGrant(tx, selected.value.data.grant, action, selected.value.data.publication); return true;
  });
}
async function dump() {
  const db = await openCanonicalDatabase();
  try { const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    for (const store of CANONICAL_STORES) rows.push([store, await tx.objectStore(store).getAll()]);
    await tx.done; return canonicalJson(rows);
  } finally { db.close(); }
}
async function corrupt(stage: 'intent' | 'claim', kind: 'record' | 'receipt' | 'source') {
  const s = await state(), row = s[stage]!, db = await openCanonicalDatabase();
  try {
    if (kind === 'record') { const record = structuredClone(row.row); (record.value as Record<string, Json>).kind = 'corrupt';
      await db.put('records', record, [s.head.gameId, record.id]);
    } else { const receipt = (await db.get('receipts', [s.head.gameId, row.source.attemptId]))!;
      if (kind === 'receipt') receipt.result = {};
      else receipt.fingerprint = canonicalJson({ ...row.source, operation: 'fixture.changed-source' });
      await db.put('receipts', receipt, [s.head.gameId, receipt.attemptId]);
    }
  } finally { db.close(); }
}
const api = { boot, state, prepare, proof, claim, replay, retry, gate, dump, corrupt,
  deleteEvidence: deleteDecisionEvidence,
  grant: () => grantWindow(session, seed),
  grantReplay: (original = seed) => grantWindow(session, original, true),
  readGrant: (original = seed) => windowGrant(original),
  adoptGuard: (exact = true) => adoptWindowGuard(session, seed, exact),
  replayWindow: (original: TransferSeed) => replayWindow(session, original),
  readCosts: (original = seed) => decisionReadCosts(original),
  draftWindow: (source: NavigationWindowSource) => draftNavigationWindow(session, source),
  seedWindow: async (source: NavigationWindowSource) => { seed = await seedNavigationWindow(session, source, seed.launchGuard); return seed; },
  confirm: (request = seed.entry.request) => confirmNavigation(session, { ...seed, entry: { ...seed.entry, request } }),
  bind: (original: TransferSeed) => { seed = structuredClone(original); },
  startOwner: async () => { session = await startGame(); return (await readCanonicalHead()).head; },
  stop: () => session?.stop(), publish: () => publishGamePublication(session),
  advance: () => advanceNavigation(session, seed), settle: () => settleNavigation(session, seed) };
declare global { interface Window { canonicalDecision: typeof api } }
window.canonicalDecision = api;

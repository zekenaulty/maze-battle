import { retainDecisionIntent } from '../../src/persistence/canonical/agentica/decision';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { retainDecisionClaim, loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { terminalAcknowledgement, type TerminalDelivery } from '../../src/persistence/canonical/agentica/terminal.ack';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical, replayAcknowledgement } from '../../src/persistence/canonical/transaction';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { json } from '../../src/persistence/canonical/world/records';
import { HostCleanupError } from '../../src/services/game/CanonicalHostRecovery';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { seedTransfer, type TransferSeed } from './canonical-operation-transfer.setup';
import { startGame } from './canonical-agentica-actions.setup';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';
import { dump, fillQuota, changeSource, corruptRecord } from './canonical-decision-ack.storage';
import { grantWindow } from './canonical-decision-grant';
import { arriveSuccessor, auditTerminalReads } from './canonical-decision-ack.successor';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5264') throw Error('Isolated decision ACK fixture only');
let session: Awaited<ReturnType<typeof startGame>>, seed: TransferSeed, last: CanonicalRequest | undefined;
let captured: { checked: ReturnType<typeof terminalAcknowledgement>;
  args: Awaited<ReturnType<ReturnType<typeof terminalAcknowledgement>['prepare']>> };
async function boot(arrive = true) {
  ({ session, seed } = await seedTransfer()); await confirmNavigation(session, seed);
  if (arrive) { for (let i = 0; i < 3; i++) await advanceNavigation(session, seed); await settleNavigation(session, seed); }
  return seed;
}
async function state() {
  const identity = await prepareAction(seed.action);
  const result = await readCanonical(p => loadAgenticaTerminal(p, identity, seed.binding)), t = result.value;
  const claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value;
  const intent = (await readCanonical(p => loadDecisionIntent(p, identity))).value;
  return { head: result.head, stats: result.stats, terminal: t && { event: t.event, operation: t.bound.operation,
    guard: t.bound.launch.guard, grant: t.bound.launch.grant, run: t.bound.launch.run, original: t.bound.original,
    confirmation: t.confirmed, progress: t.bound.progress },
    intent: intent && { reference: intent.reference, data: intent.data, row: intent.row, source: intent.source },
    claim: claim && { reference: claim.reference, data: claim.data, row: claim.row, source: claim.source } };
}
async function prepare() {
  const identity = await prepareAction(seed.action), binding = seed.binding, publication = await publishGamePublication(session);
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision',
    input: json({ action: identity.storageKey, binding, publication }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainDecisionIntent(tx, r, identity, binding, publication)).receipt, options) });
  return state();
}
export interface DecisionAckClaim { intent: ProtocolRef; started: LaunchStarted; entry: AgenticaOperationEntry }
async function proof(): Promise<DecisionAckClaim> {
  const s = await state(), d = s.intent!, epoch = d.data.adoption?.nextSessionEpoch ?? d.data.event.sessionEpoch;
  const started = { ...s.terminal!.run!.value.data.started, runId: crypto.randomUUID(), sessionEpoch: epoch };
  return { intent: d.reference, started, entry: { ...structuredClone(seed.entry), activeEpoch: epoch, state: 'waking',
    latestEvent: d.data.event, wakeRunId: started.runId, ...(d.data.adoption ? { wakeAdoption: d.data.adoption } : {}) } };
}
async function claim(p: DecisionAckClaim) {
  const identity = await prepareAction(seed.action);
  return session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim',
    input: json({ action: identity.storageKey, ...p }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainDecisionClaim(tx, r, identity, p.intent, p.started, p.entry)).receipt, options) });
}
async function ack(entry: AgenticaOperationEntry, delivery: TerminalDelivery = 'decision-handoff', retry?: CanonicalRequest) {
  const checked = terminalAcknowledgement(await prepareAction(seed.action), seed.binding, entry, delivery);
  try {
    const result = await session.cleanupHostOperation(retry ? { kind: 'verified-retry', request: retry, verify: checked.verify }
      : { kind: 'verified-ack', ...await checked.prepare(), verify: checked.verify });
    last = result.request; return result;
  } catch (error) { if (error instanceof HostCleanupError) last = error.request; throw error; }
}
async function cancel(guard = true) {
  const { head } = await readCanonicalHead();
  return session.cleanupHostOperation({ kind: 'cancel', target: { generation: head.generation, gameId: head.gameId,
    operationId: guard ? seed.launchGuard : seed.operationId } });
}
const api = { boot, state, prepare, proof, claim, ack, cancel, dump, changeSource, corruptRecord,
  grant: () => grantWindow(session, seed),
  arriveSuccessor: async () => { seed = await arriveSuccessor(session, seed); return seed; },
  audit: () => auditTerminalReads(seed),
  replayCommittedAck: (request: CanonicalRequest) => replayAcknowledgement(request),
  prepareAck: async (entry: AgenticaOperationEntry, mutate = false) => {
    const checked = terminalAcknowledgement(await prepareAction(seed.action), seed.binding, entry, 'decision-handoff');
    if (mutate) { entry.wakeRunId = 'foreign'; entry.request.objective = 'changed after capture'; }
    captured = { checked, args: await checked.prepare() }; return captured.args;
  },
  commitPrepared: () => session.cleanupHostOperation({ kind: 'verified-ack', ...captured.args, verify: captured.checked.verify }),
  lastRequest: () => structuredClone(last), stop: () => session?.stop(),
  bind: (original: TransferSeed) => { seed = structuredClone(original); },
  resume: async () => { session = await startGame(); return (await readCanonicalHead()).head; },
  quota: async () => { await fillQuota(); return publishGamePublication(session).then(() => 'accepted', String); },
};
declare global { interface Window { canonicalDecisionAck: typeof api } }
window.canonicalDecisionAck = api;

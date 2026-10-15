import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { loadDecisionIntent } from './decision.records';
import { loadDecisionClaim } from './decision.claim';
import { decisionEntry } from './decision.entry';
import { decisionClaimSettlement } from './terminal.decision';
import type { AgenticaTerminal } from './terminal.base';
import type { OperationRead } from './operation.types';
import { equal } from './validation';

async function rootContext(pages: OperationRead, terminal: AgenticaTerminal, beforeRevision = Number.MAX_SAFE_INTEGER) {
  const { bound } = terminal, guard = bound.launch.guard;
  // loadLaunch has already checked the full original-start ACK proof, including its remote settlement.
  check(guard.state === 'acknowledged' && guard.terminal?.disposition === 'cancelled', 'decision cleanup needs verified root settlement');
  const root = await pages.sourceReceipt(guard.acknowledgementAttemptId!);
  const decision = await loadDecisionIntent(pages, terminal.identity, bound);
  check(terminal.event.kind === 'decision' && terminal.terminal.disposition === 'completed'
    && decision && equal(decision.data.binding, terminal.binding) && equal(decision.terminal.event, terminal.event),
  'root settlement lacks original decision evidence');
  check(decision.row.revision <= root.receipt.beforeRevision && root.receipt.afterRevision <= beforeRevision,
    'root settlement does not precede navigation discharge');
  const retained = await loadDecisionClaim(pages, terminal.identity);
  // A later evidence-only claim must not rewrite what an earlier cleanup actually relied on.
  const claim = retained && retained.row.revision <= beforeRevision ? retained : null;
  return { decision, claim, references: { intent: decision.reference, claim: claim?.reference ?? null,
    rootAcknowledgement: root.source.attemptId } };
}

function remoteEvidence(context: Awaited<ReturnType<typeof rootContext>>, entry: AgenticaOperationEntry) {
  const remote = decisionEntry(context.decision, entry);
  check(remote.state !== 'waking', 'root settlement conflicts with an open decision operation');
  if (context.claim) decisionClaimSettlement(context.claim, entry);
  return remote;
}

/** Root session quiescence plus this exact navigation/decision entry discharges capacity, never execution authority. */
export async function decisionRootStopEvidence(pages: OperationRead, terminal: AgenticaTerminal, entry: AgenticaOperationEntry) {
  const before = terminal.bound.operation.state === 'acknowledged'
    ? (await pages.sourceReceipt(terminal.bound.operation.acknowledgementAttemptId!)).receipt.beforeRevision : undefined;
  const context = await rootContext(pages, terminal, before);
  return { decision: context.references, remote: remoteEvidence(context, entry) };
}

export async function validateDecisionRootStopProof(pages: OperationRead, terminal: AgenticaTerminal,
  inputReferences: unknown, inputRemote: unknown, beforeRevision: number) {
  const refs = fields(inputReferences, 'intent claim rootAcknowledgement');
  const remote = fields(inputRemote, 'runId activeEpoch state usage settledUsage stopped');
  const context = await rootContext(pages, terminal, beforeRevision);
  check(equal(refs, context.references), 'decision root settlement references changed');
  const { decision } = context, event = decision.data.event;
  const entry = { request: terminal.bound.start, action: terminal.identity.action, admission: terminal.bound.result,
    activeEpoch: remote.activeEpoch, state: remote.state, usage: remote.usage, settledUsage: remote.settledUsage,
    latestEvent: event, ...(remote.runId === null ? {} : { wakeRunId: remote.runId }),
    ...(remote.runId !== null && decision.data.adoption ? { wakeAdoption: decision.data.adoption } : {}),
    ...(remote.stopped ? { stopDecision: event } : {}) } as unknown as AgenticaOperationEntry;
  check(equal(remote, remoteEvidence(context, entry)), 'decision root settlement evidence changed');
}

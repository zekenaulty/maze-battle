import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { loadDecisionClaim, validateDecisionClaim } from './decision.claim';
import type { OperationRead } from './operation.types';
import { validateOperationEntry } from './operation.wire';
import type { AgenticaTerminal } from './terminal.base';
import { equal } from './validation';

type Claim = NonNullable<Awaited<ReturnType<typeof loadDecisionClaim>>>;
async function loadHandoff(pages: OperationRead, terminal: AgenticaTerminal) {
  const claim = await loadDecisionClaim(pages, terminal.identity);
  check(terminal.event.kind === 'decision' && terminal.terminal.disposition === 'completed'
    && claim && equal(claim.decision.data.binding, terminal.binding)
    && equal(claim.decision.terminal.event, terminal.event), 'decision handoff lacks exact retained intent and claim');
  return claim;
}

export function decisionClaimSettlement(claim: Claim, entry: AgenticaOperationEntry) {
  const current = validateDecisionClaim(claim.decision, claim.data.started, entry), original = claim.data;
  if (original.state !== 'waking') {
    check(equal(current.settledUsage, original.settledUsage) && (current.state === original.state
      && current.stopped === original.stopped || !original.stopped && ['blocked', 'cancelled'].includes(original.state)
      && current.state === 'cancelled' && current.stopped), 'decision handoff rewinds or replaces settled claim');
  }
  return current;
}

async function handoffEvidence(pages: OperationRead, terminal: AgenticaTerminal, claim: Claim,
  entry: AgenticaOperationEntry, beforeRevision?: number) {
  validateOperationEntry(entry, terminal.bound.start, terminal.identity.action, terminal.bound.result,
    claim.decision.data.adoption?.nextSessionEpoch ?? claim.decision.data.event.sessionEpoch);
  const current = decisionClaimSettlement(claim, entry);
  // A later local Stop cannot invalidate an earlier ACK. A Stop preceding ACK needs its exact remote marker.
  const stop = terminal.bound.launch.guard.terminal;
  const stopped = stop?.disposition === 'cancelled' && (beforeRevision === undefined
    || (await pages.sourceReceipt(stop.attemptId)).receipt.afterRevision <= beforeRevision);
  check(current.stopped === !!stopped, 'decision handoff Stop evidence changed');
  return { decision: { intent: claim.decision.reference, claim: claim.reference },
    remote: { activeEpoch: entry.activeEpoch, state: current.state, usage: current.usage,
      settledUsage: current.settledUsage, stopped: current.stopped } };
}

/** Only navigation custody is discharged. The claimed run is not an action grant or objective completion. */
export async function decisionHandoffEvidence(pages: OperationRead, terminal: AgenticaTerminal, entry: AgenticaOperationEntry) {
  const claim = await loadHandoff(pages, terminal);
  const before = terminal.bound.operation.state === 'acknowledged'
    ? (await pages.sourceReceipt(terminal.bound.operation.acknowledgementAttemptId!)).receipt.beforeRevision : undefined;
  return handoffEvidence(pages, terminal, claim, entry, before);
}

/** Two fixed immutable record references, never another public terminal/ACK read. */
export async function validateDecisionHandoffProof(pages: OperationRead, terminal: AgenticaTerminal,
  inputReferences: unknown, inputRemote: unknown, beforeRevision: number) {
  const refs = fields(inputReferences, 'intent claim'), remote = fields(inputRemote, 'activeEpoch state usage settledUsage stopped');
  const claim = await loadHandoff(pages, terminal);
  check(equal(refs.intent, claim.decision.reference) && equal(refs.claim, claim.reference)
    && claim.row.revision <= beforeRevision, 'decision handoff acknowledgement references changed');
  const decision = claim.decision.data;
  const entry = { request: terminal.bound.start, action: terminal.identity.action, admission: terminal.bound.result,
    activeEpoch: remote.activeEpoch, state: remote.state, usage: remote.usage, settledUsage: remote.settledUsage,
    wakeRunId: claim.data.started.runId, latestEvent: decision.event,
    ...(decision.adoption ? { wakeAdoption: decision.adoption } : {}),
    ...(remote.stopped ? { stopDecision: decision.event } : {}) } as unknown as AgenticaOperationEntry;
  const expected = await handoffEvidence(pages, terminal, claim, entry, beforeRevision);
  check(equal(remote, expected.remote), 'decision handoff acknowledgement evidence changed');
}

import type { AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { terminalAcknowledgement, type TerminalDelivery } from '../../../persistence/canonical/agentica/terminal.ack';
import { readAgenticaTerminal } from '../../../persistence/canonical/agentica/terminal';
import { validateDecisionClaim } from '../../../persistence/canonical/agentica/decision.claim';
import { equivalentOperationWire } from '../../../persistence/canonical/agentica/operation.wire';
import { check, sameFence } from '../../../persistence/canonical/validation';
import { equal } from '../../../persistence/canonical/agentica/validation';
import type { ActionBinding } from './actionContract';
import { decisionState } from './decisionState';
import { readDecisionRemote, type DecisionSdk } from './decisionRemote';

export function decisionCleanup(port: CanonicalRecoveryPort, identity: PreparedAction, binding: ActionBinding,
  sdk: DecisionSdk, network: typeof fetch, signal: AbortSignal, hostSignal: AbortSignal) {
  let stopRetry: CanonicalRequest | undefined;
  let ackRetry: { request: CanonicalRequest; entry: AgenticaOperationEntry; delivery: TerminalDelivery } | undefined;
  async function cancel() {
    const { terminal } = (await decisionState(identity, binding)).value, guard = terminal.bound.launch.guard;
    signal.throwIfAborted();
    if (!guard.terminal) {
      try { await port.cleanupHostOperation(stopRetry ? { kind: 'retry', request: stopRetry }
        : { kind: 'cancel', target: { generation: guard.generation, gameId: guard.gameId, operationId: guard.id } }, hostSignal); stopRetry = undefined; }
      catch (error) { if (error instanceof HostCleanupError) stopRetry = structuredClone(error.request); throw error; }
    }
    return { status: 'locally-stopped' as const };
  }
  async function acknowledge() {
    const view = await decisionState(identity, binding), { terminal, decision, claim } = view.value;
    signal.throwIfAborted();
    const acknowledged = terminal.bound.operation.state === 'acknowledged';
    const stopped = terminal.bound.launch.guard.terminal?.disposition === 'cancelled';
    if (acknowledged) {
      await readAgenticaTerminal(identity, binding); signal.throwIfAborted();
      if (!stopped || terminal.bound.launch.guard.state === 'acknowledged')
        return { status: 'navigation-acknowledged' as const };
    }
    check(decision, 'retain the exact decision intention before handoff acknowledgement');
    const delivery = terminal.bound.launch.guard.state === 'acknowledged' ? 'decision-root-stop' : 'decision-handoff';
    const hasStop = (entry: AgenticaOperationEntry) => !!entry.stopDecision
      && equivalentOperationWire(entry.stopDecision, decision.data.event, 'event');
    // The atomic operation read proves a previous ACK did not commit. Rebase only those stale attempts.
    if (ackRetry && (!sameFence(view.head, ackRetry.request.expected) || ackRetry.delivery !== delivery
      || delivery === 'decision-handoff' && stopped && !hasStop(ackRetry.entry))) ackRetry = undefined;
    let entry = ackRetry?.entry ?? await readDecisionRemote(sdk, decision, network, signal);
    if (delivery === 'decision-handoff' && stopped && !hasStop(entry)) {
      check(entry.state !== 'continued', 'admitted successor requires separate child and root recovery');
      entry = await sdk.stopDecision(structuredClone(decision.data.event), { fetchImpl: network }); signal.throwIfAborted();
    }
    if (delivery === 'decision-handoff') {
      check(claim, 'retain the exact successor claim before handoff acknowledgement');
      validateDecisionClaim(decision, claim.data.started, entry);
      check(!stopped || hasStop(entry), 'decision Stop was not accepted');
    }
    if (acknowledged) return { status: 'navigation-acknowledged' as const };
    const checked = terminalAcknowledgement(identity, binding, entry, delivery), args = await checked.prepare();
    signal.throwIfAborted();
    // A claim may have arrived after preparation but before the failed transaction captured its fence.
    if (ackRetry && !equal(ackRetry.request.input, { operationId: args.target.operationId,
      terminalAttemptId: args.terminalAttemptId, proof: args.proof })) ackRetry = undefined;
    try { await port.cleanupHostOperation(ackRetry ? { kind: 'verified-retry', request: ackRetry.request, verify: checked.verify }
      : { kind: 'verified-ack', ...args, verify: checked.verify }, hostSignal); ackRetry = undefined; }
    catch (error) { if (error instanceof HostCleanupError) ackRetry = { request: structuredClone(error.request), entry: structuredClone(entry), delivery }; throw error; }
    return { status: 'navigation-acknowledged' as const };
  }
  return { cancel, acknowledge };
}

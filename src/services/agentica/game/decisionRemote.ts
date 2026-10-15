import type { AgenticaHost, AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import type { RetainedDecision } from '../../../persistence/canonical/agentica/decision.records';
import { equivalentOperationWire, operationEntryShape, validateOperationEntry } from '../../../persistence/canonical/agentica/operation.wire';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { nextOperationPrefix } from './operationPrefix';

export type DecisionSdk = Pick<AgenticaHost, 'connect' | 'close' | 'listOperations' | 'signalOperation' | 'wakeOperation' | 'adoptDecision' | 'stopDecision'>;
export async function readDecisionRemote(sdk: DecisionSdk, decision: RetainedDecision, network: typeof fetch, signal: AbortSignal) {
  const { terminal, identity, data } = decision, { bound } = terminal;
  const entries = await sdk.listOperations({ hostId: data.event.hostId, sessionId: data.event.sessionId, fetchImpl: network });
  signal.throwIfAborted();
  const matches = entries.filter(e => e.action.runId === identity.action.runId && e.action.actionId === identity.action.actionId);
  check(matches.length === 1, 'missing or ambiguous decision service custody');
  const entry = operationEntryShape(matches[0]);
  check([terminal.event.sessionEpoch, terminal.transfer?.data.event.sessionEpoch, data.adoption?.nextSessionEpoch]
    .includes(entry.activeEpoch), 'decision service epoch changed');
  validateOperationEntry(entry, bound.start, identity.action, bound.result, entry.activeEpoch);
  check(equal(entry.usage, terminal.confirmed!.data.entry.usage), 'decision admission usage changed');
  return entry;
}

export async function deliverDecisionPrefix(sdk: DecisionSdk, decision: RetainedDecision, entry: AgenticaOperationEntry,
  network: typeof fetch, signal: AbortSignal) {
  if (entry.latestEvent && equivalentOperationWire(entry.latestEvent, decision.data.event, 'event')) return null;
  check(entry.state === 'parked' && entry.wakeRunId == null && entry.stopDecision == null, 'decision service history diverged');
  const next = nextOperationPrefix(decision.terminal, entry);
  if (!next) return null;
  const remote = operationEntryShape(await sdk.signalOperation(structuredClone(next), { fetchImpl: network }));
  signal.throwIfAborted();
  validateOperationEntry(remote, decision.terminal.bound.start, decision.identity.action, decision.terminal.bound.result,
    next.nextSessionEpoch ?? next.sessionEpoch);
  check(equal(remote.usage, entry.usage) && remote.state === 'parked' && remote.latestEvent
    && equivalentOperationWire(remote.latestEvent, next, 'event'), 'service did not acknowledge exact decision predecessor');
  return next.sequence;
}

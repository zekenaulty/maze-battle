import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, integer } from '../validation';
import { launchPages } from './launch.records';
import { launchStarted } from './launch.wire';
import type { LaunchStarted } from './launch.types';
import { loadOperationRecord, operationRequest, writeOperationRecord } from './operation.records';
import type { OperationRead } from './operation.types';
import { equivalentOperationWire, operationEntryShape, validateOperationEntry } from './operation.wire';
import { decisionKey, loadDecisionIntent, type RetainedDecision } from './decision.records';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';

export interface DecisionClaim {
  intent: ProtocolRef; started: LaunchStarted; usage: AgenticaOperationEntry['usage'];
  state: string; settledUsage: AgenticaOperationEntry['usage'] | null; stopped: boolean;
}
function sameAdoption(remote: AgenticaOperationEntry['wakeAdoption'], expected: RetainedDecision['data']['adoption']) {
  if (!expected) return remote == null;
  if (!remote) return false;
  fields(remote, 'adoptionId nextSessionEpoch observation');
  return remote.adoptionId === expected.adoptionId && remote.nextSessionEpoch === expected.nextSessionEpoch
    && equivalentOperationWire({ observation: remote.observation }, { observation: expected.observation }, 'result');
}
export function validateDecisionClaim(decision: RetainedDecision, startedInput: LaunchStarted, remote: AgenticaOperationEntry) {
  const { terminal, data } = decision, entry = operationEntryShape(remote);
  const epoch = data.adoption?.nextSessionEpoch ?? data.event.sessionEpoch;
  const started = launchStarted(startedInput, { ...terminal.bound.launch.acceptedStart, sessionEpoch: epoch });
  validateOperationEntry(entry, terminal.bound.launch.acceptedStart, decision.identity.action, terminal.bound.result, epoch);
  check(['waking', 'continued', 'completed', 'blocked', 'cancelled'].includes(entry.state) && entry.wakeRunId === started.runId
    && started.runId !== decision.identity.action.runId && started.manifestHash === decision.identity.action.manifestHash
    && entry.latestEvent && equivalentOperationWire(entry.latestEvent, data.event, 'event')
    && sameAdoption(entry.wakeAdoption, data.adoption)
    && equal(entry.usage, terminal.confirmed!.data.entry.usage), 'service did not claim exact decision successor');
  const settled = (entry as unknown as Record<string, unknown>).settledUsage;
  const stopped = entry.stopDecision != null;
  check(!stopped || entry.state === 'cancelled' && equivalentOperationWire(entry.stopDecision, data.event, 'event'), 'decision stop changed');
  if (settled != null) {
    const usage = fields(settled, 'steps refinements continuations providerCalls');
    check(entry.state !== 'waking' && Object.entries(usage).every(([k, n]) => integer(n)
      && n >= entry.usage[k as keyof typeof entry.usage]) && Number(usage.continuations) > entry.usage.continuations,
    'decision settlement usage changed');
  } else check(entry.state === 'waking' && !stopped || entry.state === 'cancelled' && stopped, 'decision settlement evidence missing');
  return { intent: decision.reference, started, usage: entry.usage, state: entry.state,
    settledUsage: (settled ?? null) as DecisionClaim['settledUsage'], stopped };
}

export async function loadDecisionClaim(pages: OperationRead, input: PreparedAction) {
  const identity = snapshotPrepared(input), record = await loadOperationRecord<DecisionClaim>(pages,
    `${decisionKey(identity)}/claim`, 'agentica-decision-claim');
  if (!record) return null;
  const decision = await loadDecisionIntent(pages, identity); check(decision, 'claim lacks decision intention');
  fields(record.data, 'intent started usage state settledUsage stopped');
  const source = fields(record.source.input, 'action intent started entry');
  check(record.source.operation === 'agentica.operation.decision-claim' && source.action === identity.storageKey
    && equal(source.intent, decision.reference) && equal(source.started, record.data.started)
    && record.row.revision > decision.row.revision, 'decision claim source changed');
  check(equal(record.data, validateDecisionClaim(decision, source.started as unknown as LaunchStarted,
    source.entry as unknown as AgenticaOperationEntry)), 'decision claim differs from service evidence');
  return { ...record, decision };
}

/** Historical service evidence can be reconciled after reload; it does not renew the writer or authorize actions. */
export async function retainDecisionClaim(tx: CanonicalWork, input: CanonicalRequest, action: PreparedAction,
  ref: ProtocolRef, startedInput: LaunchStarted, remote: AgenticaOperationEntry) {
  const identity = snapshotPrepared(action), intent = snapshotReference(ref), entry = operationEntryShape(remote);
  const started = snapshotJson(startedInput, 2048);
  const request = operationRequest(tx, input, 'agentica.operation.decision-claim', { action: identity.storageKey, intent, started, entry });
  const pages = launchPages(tx), decision = await loadDecisionIntent(pages, identity);
  check(decision && equal(decision.reference, intent), 'decision intention changed');
  const data = validateDecisionClaim(decision, started, entry);
  const existing = await loadDecisionClaim(pages, identity);
  if (existing) {
    check(equal(existing.data, data), 'decision successor changed');
    return { reference: existing.reference, receipt: { reference: existing.reference } };
  }
  return writeOperationRecord(tx, request, `${decisionKey(identity)}/claim`, 'agentica-decision-claim', data);
}

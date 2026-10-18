import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, validId } from '../validation';
import { launchPages } from './launch.records';
import { launchStarted } from './launch.wire';
import type { LaunchStarted } from './launch.types';
import { loadOperationRecord, operationRequest, writeOperationRecord } from './operation.records';
import type { OperationRead } from './operation.types';
import { operationEntryShape } from './operation.wire';
import { decisionKey, loadDecisionIntent, type RetainedDecision } from './decision.records';
import { decisionEntry } from './decision.entry';
import { claimedParentKey, claimedParentValue } from './decision.claim.locator';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';

export interface DecisionClaim {
  intent: ProtocolRef; started: LaunchStarted; usage: AgenticaOperationEntry['usage'];
  state: string; settledUsage: AgenticaOperationEntry['usage'] | null; stopped: boolean;
  locatorId: string;
}
export function validateDecisionClaim(decision: RetainedDecision, startedInput: LaunchStarted, remote: AgenticaOperationEntry) {
  const { terminal, data } = decision, entry = decisionEntry(decision, remote);
  const epoch = data.adoption?.nextSessionEpoch ?? data.event.sessionEpoch;
  const started = launchStarted(startedInput, { ...terminal.bound.start, sessionEpoch: epoch });
  check(entry.runId === started.runId && started.manifestHash === decision.identity.action.manifestHash,
    'service did not claim exact decision successor');
  return { intent: decision.reference, started, usage: entry.usage, state: entry.state,
    settledUsage: entry.settledUsage, stopped: entry.stopped };
}

export async function loadDecisionClaim(pages: OperationRead, input: PreparedAction) {
  const identity = snapshotPrepared(input), record = await loadOperationRecord<DecisionClaim>(pages,
    `${decisionKey(identity)}/claim`, 'agentica-decision-claim');
  if (!record) return null;
  const decision = await loadDecisionIntent(pages, identity); check(decision, 'claim lacks decision intention');
  fields(record.data, 'intent started usage state settledUsage stopped locatorId');
  check(validId(record.data.locatorId), 'invalid claimed parent locator');
  const source = fields(record.source.input, 'action intent started entry');
  check(record.source.operation === 'agentica.operation.decision-claim' && source.action === identity.storageKey
    && equal(source.intent, decision.reference) && equal(source.started, record.data.started)
    && record.row.revision > decision.row.revision, 'decision claim source changed');
  check(equal(record.data, { ...validateDecisionClaim(decision, source.started as unknown as LaunchStarted,
    source.entry as unknown as AgenticaOperationEntry), locatorId: record.data.locatorId }), 'decision claim differs from service evidence');
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
  const { launch, active, original } = decision.terminal.bound, launchId = launch.binding.launchId;
  check(active?.id === launchId && active.sourceAttemptId === launch.guard.admissionAttemptId, 'claimed parent root is no longer active');
  const data = validateDecisionClaim(decision, started, entry);
  const existing = await loadDecisionClaim(pages, identity);
  if (existing) {
    check(equal(existing.data, { ...data, locatorId: existing.data.locatorId }), 'decision successor changed');
    return { reference: existing.reference, receipt: { reference: existing.reference } };
  }
  // Only a new immutable claim advances discovery; replay must not rewind the current locator.
  const pointer = await tx.pages.set('execution', claimedParentKey(launchId),
    claimedParentValue(launchId, request.attemptId, original.reference, decision.data.binding) as unknown as JsonObject);
  return writeOperationRecord(tx, request, `${decisionKey(identity)}/claim`, 'agentica-decision-claim', { ...data, locatorId: pointer.id });
}

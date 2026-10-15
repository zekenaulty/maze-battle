import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, integer, validId } from '../validation';
import type { RetainedDecision } from './decision.records';
import { equivalentOperationWire, operationEntryShape, validateOperationEntry } from './operation.wire';
import { equal } from './validation';

function sameAdoption(remote: AgenticaOperationEntry['wakeAdoption'], expected: RetainedDecision['data']['adoption']) {
  if (!expected) return remote == null;
  if (!remote) return false;
  fields(remote, 'adoptionId nextSessionEpoch observation');
  return remote.adoptionId === expected.adoptionId && remote.nextSessionEpoch === expected.nextSessionEpoch
    && equivalentOperationWire({ observation: remote.observation }, { observation: expected.observation }, 'result');
}

/** An operation entry is evidence, not a correlated started reply or permission to grant execution. */
export function decisionEntry(decision: RetainedDecision, input: AgenticaOperationEntry) {
  const { terminal, data } = decision, entry = operationEntryShape(input), runId = entry.wakeRunId ?? null;
  const adoption = runId === null ? null : data.adoption;
  const epoch = adoption?.nextSessionEpoch ?? data.event.sessionEpoch;
  validateOperationEntry(entry, terminal.bound.start, decision.identity.action, terminal.bound.result, epoch);
  check(['waking', 'continued', 'completed', 'blocked', 'cancelled'].includes(entry.state)
    && (runId === null || validId(runId) && runId !== decision.identity.action.runId)
    && entry.latestEvent && equivalentOperationWire(entry.latestEvent, data.event, 'event')
    && sameAdoption(entry.wakeAdoption, adoption)
    && equal(entry.usage, terminal.confirmed!.data.entry.usage), 'service did not retain exact decision operation');
  const settled = (entry as unknown as Record<string, unknown>).settledUsage, stopped = entry.stopDecision != null;
  check(!stopped || entry.state === 'cancelled' && equivalentOperationWire(entry.stopDecision, data.event, 'event'), 'decision stop changed');
  if (runId === null) check(stopped && settled == null, 'unclaimed decision is not exactly suppressed');
  if (settled != null) {
    const usage = fields(settled, 'steps refinements continuations providerCalls');
    check(entry.state !== 'waking' && Object.entries(usage).every(([k, n]) => integer(n)
      && n >= entry.usage[k as keyof typeof entry.usage]) && Number(usage.continuations) > entry.usage.continuations,
    'decision settlement usage changed');
  } else check(entry.state === 'waking' && !stopped || entry.state === 'cancelled' && stopped, 'decision settlement evidence missing');
  return { runId, activeEpoch: epoch, state: entry.state, usage: entry.usage,
    settledUsage: (settled ?? null) as AgenticaOperationEntry['usage'] | null, stopped };
}

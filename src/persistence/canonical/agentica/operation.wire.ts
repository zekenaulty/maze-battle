import type { AgenticaAction, AgenticaResult, AgenticaStart } from '../../../services/agentica/contracts';
import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { equivalentHostWire } from '../../../services/agentica/directed/wire';
import { fields } from '../roster/codec';
import { check, integer, isObject } from '../validation';
import { equal, snapshotJson } from './validation';
import { MAX_OPERATION_ENTRY_BYTES } from './operation.types';

type ObjectValue = Record<string, unknown>;
function omitNulls(value: ObjectValue, keys: string[]) { for (const key of keys) if (value[key] === null) delete value[key]; }
function observation(input: unknown) {
  const value = input as ObjectValue;
  if (!value || typeof value !== 'object') return;
  omitNulls(value, ['facts']);
  if (typeof value.observedAt === 'string') value.observedAt = value.observedAt.replace(/(?:Z|[+-]00:00)$/, '+00:00')
    .replace(/\.(\d*?[1-9])?0+(?=[+-]\d{2}:\d{2}$)/, (_, fraction: string) => fraction ? `.${fraction}` : '');
  if (value.facts !== undefined) {
    check(Array.isArray(value.facts) && value.facts.every(isObject), 'invalid typed observation facts');
    for (const fact of value.facts) {
      if (fact.state === 'observed') delete fact.state;
      omitNulls(fact, ['evidenceObservationIds', 'supersedes']);
    }
  }
}
/** Only typed .NET wire defaults are normalized; arbitrary observation data is never repaired. */
export function equivalentOperationWire(a: unknown, b: unknown, kind: 'event' | 'result') {
  const normalize = (input: unknown) => {
    const value = snapshotJson(input, MAX_OPERATION_ENTRY_BYTES) as ObjectValue;
    observation(value?.observation); return value;
  };
  return equivalentHostWire(normalize(a), normalize(b), kind);
}
export function equivalentOperationStart(a: unknown, b: AgenticaStart) {
  const normalize = (input: unknown) => {
    const s = snapshotJson(input, MAX_OPERATION_ENTRY_BYTES) as unknown as AgenticaStart & ObjectValue;
    const p = s.provider as unknown as ObjectValue, limits = s.limits as unknown as ObjectValue;
    fields(s, 'protocolVersion hostId sessionId sessionEpoch scopeId perspectiveId objectiveId objective observation capabilities provider limits');
    fields(p, 'provider contextWindowTokens maxOutputTokens', 'model thinkingEffort includeThoughtSummaries geminiApi thinkingEffortResolved');
    omitNulls(p, ['model', 'thinkingEffort', 'geminiApi']);
    if (p.includeThoughtSummaries === false) delete p.includeThoughtSummaries;
    // Service bookkeeping is not permission to change the resolved model or thinking setting.
    if (typeof p.thinkingEffortResolved === 'boolean') delete p.thinkingEffortResolved;
    for (const key of ['maxRecentObservations', 'maxRecentReceipts']) if (limits[key] === 6) delete limits[key];
    observation(s.observation);
    check(Array.isArray(s.capabilities), 'invalid operation manifests');
    for (const c of s.capabilities) {
      if (c.durableHandoff === false) delete c.durableHandoff;
      for (const f of c.inputSchema.fields) omitNulls(f as unknown as ObjectValue, ['description', 'allowedValues', 'example', 'minimum', 'maximum']);
    }
    return s;
  };
  const left = normalize(a), right = normalize(b);
  return equivalentHostWire({ observation: left.observation }, { observation: right.observation }, 'adoption')
    && equal({ ...left, observation: null }, { ...right, observation: null });
}
export function operationEntryShape(input: AgenticaOperationEntry) {
  const entry = snapshotJson(input, MAX_OPERATION_ENTRY_BYTES);
  fields(entry, 'request action admission activeEpoch state usage', 'latestEvent stopDecision wakeRunId wakeAdoption createdAt updatedAt settledUsage');
  const usage = fields(entry.usage, 'steps refinements continuations providerCalls');
  check(Object.values(usage).every(n => integer(n)), 'invalid service operation usage');
  for (const key of ['createdAt', 'updatedAt']) {
    const value = (entry as unknown as ObjectValue)[key];
    check(value === undefined || typeof value === 'string' && value.length <= 40
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && Number.isFinite(Date.parse(value)), 'invalid service operation timestamp');
  }
  return entry;
}
export function operationEntry(input: AgenticaOperationEntry) {
  const entry = operationEntryShape(input);
  check(entry.state === 'parked' && entry.wakeRunId == null && entry.wakeAdoption == null && entry.stopDecision == null
    && (entry as unknown as ObjectValue).settledUsage == null, 'service operation is not parked in original custody');
  return entry;
}
export function validateOperationEntry(entry: AgenticaOperationEntry, start: AgenticaStart, action: AgenticaAction, admission: AgenticaResult) {
  check(equivalentOperationStart(entry.request, start) && equal(entry.action, action)
    && equivalentOperationWire(entry.admission, admission, 'result') && entry.activeEpoch === action.sessionEpoch,
  'service operation differs from original request, action or admission');
}

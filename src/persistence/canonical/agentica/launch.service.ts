import type { AgenticaStart } from '../../../services/agentica/contracts';
import type { HostStartEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { equivalentOperationStart } from './operation.wire';
import { launchStart } from './launch.wire';
import { snapshotJson, wireId } from './validation';

/** The original request already has canonical custody; retain only the service identity and resolved settings. */
export interface LaunchAdmission {
  schema: 1; attemptId: string; runId: string; originalRequestHash: string; acceptedRequestHash: string;
  manifestHash: string; provider: AgenticaStart['provider']; admittedAt: string;
}
export type LaunchSettlement = NonNullable<HostStartEntry['terminal']>;
function ticks(value: unknown) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const seconds = match ? Date.parse(`${match[1]}${match[3]}`) : NaN;
  check(Number.isFinite(seconds), 'invalid service start timestamp');
  const result = BigInt(seconds) * 10000n + BigInt((match && match[2] || '').padEnd(7, '0'));
  check(result !== -621355968000000000n, 'default service start timestamp'); return result;
}
function provider(input: unknown, start: AgenticaStart) {
  const raw = fields(input, 'provider contextWindowTokens maxOutputTokens', 'model thinkingEffort includeThoughtSummaries geminiApi thinkingEffortResolved');
  check(raw.geminiApi == null && (raw.thinkingEffortResolved === undefined || typeof raw.thinkingEffortResolved === 'boolean'), 'unsupported service provider settings');
  const p = { ...raw }; delete p.geminiApi; delete p.thinkingEffortResolved;
  for (const key of ['model', 'thinkingEffort']) if (p[key] === null) delete p[key];
  if (p.includeThoughtSummaries === false) delete p.includeThoughtSummaries;
  const accepted = launchStart({ ...start, provider: p as unknown as AgenticaStart['provider'] }).provider;
  const requested = start.provider;
  check(accepted.provider === requested.provider && accepted.contextWindowTokens === requested.contextWindowTokens
    && accepted.maxOutputTokens === requested.maxOutputTokens && !!accepted.includeThoughtSummaries === !!requested.includeThoughtSummaries
    && (requested.model === undefined || accepted.model === requested.model)
    && (requested.thinkingEffort === undefined || accepted.thinkingEffort === requested.thinkingEffort), 'service changed requested provider settings');
  return accepted;
}
export function validateLaunchAdmission(input: unknown, start: AgenticaStart, attemptId: string): LaunchAdmission {
  const value = snapshotJson(input, 2048);
  const a = fields(value, 'schema attemptId runId originalRequestHash acceptedRequestHash manifestHash provider admittedAt');
  check(a.schema === 1 && a.attemptId === attemptId, 'service start attempt changed'); wireId(a.attemptId); wireId(a.runId);
  for (const key of ['originalRequestHash', 'acceptedRequestHash', 'manifestHash'])
    check(typeof a[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(a[key]), 'invalid service start digest');
  ticks(a.admittedAt); provider(a.provider, start);
  return value as LaunchAdmission;
}
export function validateLaunchSettlement(input: unknown, admission: LaunchAdmission): LaunchSettlement {
  const terminal = snapshotJson(input, 1024), t = fields(terminal, 'reason usage usageUnknown settledAt');
  check(t.reason === 'stopped' || t.reason === 'interrupted', 'invalid service start settlement');
  check(ticks(t.settledAt) >= ticks(admission.admittedAt), 'service settlement predates admission');
  if (t.reason === 'interrupted') check(t.usage === null && t.usageUnknown === true, 'interrupted usage must remain unknown');
  else {
    check(t.usageUnknown === false, 'stopped usage must be known');
    check(Object.values(fields(t.usage, 'steps refinements continuations providerCalls')).every(n => integer(n)), 'invalid service start usage');
  }
  return terminal as LaunchSettlement;
}
/** Compare full typed authority, not purported client recomputation of .NET request hashes. */
export function captureLaunchAdmission(input: unknown, start: AgenticaStart, attemptId: string) {
  const entry = snapshotJson(input, 16 * 1024);
  const e = fields(entry, 'schema attemptId runId originalRequest originalRequestHash acceptedRequest acceptedRequestHash manifestHash stopRequested terminal admittedAt');
  check(e.schema === 1 && typeof e.stopRequested === 'boolean', 'invalid durable start entry');
  check(equivalentOperationStart(e.originalRequest, start), 'service original start differs from retained request');
  const accepted = fields(e.acceptedRequest, 'protocolVersion hostId sessionId sessionEpoch scopeId perspectiveId objectiveId objective observation capabilities provider limits');
  const resolved = provider(accepted.provider, start);
  check(equivalentOperationStart(e.acceptedRequest, { ...start, provider: resolved }), 'service accepted start changed authority');
  const admission = validateLaunchAdmission({ schema: 1, attemptId: e.attemptId, runId: e.runId,
    originalRequestHash: e.originalRequestHash, acceptedRequestHash: e.acceptedRequestHash, manifestHash: e.manifestHash,
    provider: resolved, admittedAt: e.admittedAt }, start, attemptId);
  const terminal = e.terminal === null ? null : validateLaunchSettlement(e.terminal, admission);
  check(!terminal || e.stopRequested === true, 'service settled start without Stop');
  return { admission, stopRequested: e.stopRequested, terminal };
}
export const acceptedLaunchStart = (start: AgenticaStart, admission: LaunchAdmission): AgenticaStart =>
  ({ ...structuredClone(start), provider: structuredClone(admission.provider) });

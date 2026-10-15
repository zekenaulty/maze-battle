import { describe, expect, it } from 'vitest';
import { launchStartFixture } from './launch.test-support';
import { captureLaunchAdmission, validateLaunchAdmission } from './launch.service';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';

function fixture() {
  const start = launchStartFixture();
  const entry = { schema: 1, attemptId: 'dispatch', runId: 'run', originalRequest: structuredClone(start), acceptedRequest: structuredClone(start),
    originalRequestHash: `sha256:${'a'.repeat(64)}`, acceptedRequestHash: `sha256:${'b'.repeat(64)}`, manifestHash: `sha256:${'c'.repeat(64)}`,
    stopRequested: false, terminal: null as unknown, admittedAt: '2026-10-15T12:00:00.1234567+00:00' };
  return { start, entry };
}
const capture = (e: ReturnType<typeof fixture>) => captureLaunchAdmission(e.entry, e.start, 'dispatch');
describe('canonical durable start service identity', () => {
  it('retains compact authority and resolved settings without duplicating either full request', () => {
    const f = fixture(); f.entry.acceptedRequest.provider.model = 'resolved-model';
    const result = capture(f); expect(result.admission.provider.model).toBe('resolved-model');
    expect(canonicalJson(result)).not.toContain('originalRequest"'); expect(canonicalJson(result)).not.toContain('acceptedRequest"');
    expect(canonicalJson(result).length).toBeLessThan(1100);
    f.entry.acceptedRequest.provider.model = 'changed'; expect(result.admission.provider.model).toBe('resolved-model');
  });
  it('accepts typed service defaults without rewriting opaque observation data', () => {
    const f = fixture(), req = f.entry.originalRequest;
    Object.assign(req.provider, { model: null, thinkingEffort: null, geminiApi: null, thinkingEffortResolved: false, includeThoughtSummaries: false });
    Object.assign(req.limits, { maxRecentObservations: 6, maxRecentReceipts: 6 });
    Object.assign(req.observation, { facts: null, observedAt: '2026-10-13T00:00:00+00:00' });
    Object.assign(req.capabilities[0], { durableHandoff: false });
    expect(() => capture(f)).not.toThrow();
  });
  it.each(['originalRequest', 'acceptedRequest'] as const)('rejects scope, content and authority edits in %s', key => {
    const changes = [
      (s: ReturnType<typeof launchStartFixture>) => { s.objective = 'another objective'; },
      (s: ReturnType<typeof launchStartFixture>) => { s.sessionEpoch = '2'; },
      (s: ReturnType<typeof launchStartFixture>) => { s.observation.data.hidden = true; },
      (s: ReturnType<typeof launchStartFixture>) => { s.capabilities[0].effect = 'writesLocalState'; },
      (s: ReturnType<typeof launchStartFixture>) => { s.limits.maxSteps++; },
      (s: ReturnType<typeof launchStartFixture>) => { s.provider.maxOutputTokens++; },
    ];
    for (const change of changes) { const f = fixture(); change(f.entry[key]); expect(() => capture(f)).toThrow(); }
  });
  it.each(['model', 'thinkingEffort'] as const)('cannot change an explicitly selected %s', key => {
    const f = fixture(); f.start.provider[key] = 'requested'; f.entry.originalRequest.provider[key] = 'requested';
    f.entry.acceptedRequest.provider[key] = 'different'; expect(() => capture(f)).toThrow();
  });
  it.each(['attemptId', 'schema', 'manifestHash', 'admittedAt'] as const)('rejects invalid %s', key => {
    const f = fixture(); Object.assign(f.entry, { [key]: 'invalid' }); expect(() => capture(f)).toThrow();
  });
  it('rejects unknown and oversized metadata', () => {
    const f = fixture(); Object.assign(f.entry, { extra: 'x' }); expect(() => capture(f)).toThrow();
    delete (f.entry as unknown as Record<string, unknown>).extra;
    f.entry.originalRequest.observation.data.huge = 'x'.repeat(17000); expect(() => capture(f)).toThrow();
  });
  it('validates compact identity again when read from history', () => {
    const f = fixture(), { admission } = capture(f);
    expect(validateLaunchAdmission(admission, f.start, 'dispatch')).toEqual(admission);
    expect(() => validateLaunchAdmission(admission, f.start, 'other')).toThrow();
    expect(() => validateLaunchAdmission({ ...admission, provider: { ...admission.provider, provider: 'openai' } }, f.start, 'dispatch')).toThrow();
  });
  it('keeps cancellation requested separate from settlement', () => {
    const f = fixture(); f.entry.stopRequested = true;
    expect(capture(f).terminal).toBeNull();
  });
  it.each(['stopped', 'interrupted'])('accepts valid %s settlement and preserves unknown usage', reason => {
    const f = fixture(); f.entry.stopRequested = true;
    f.entry.terminal = { reason, usage: reason === 'stopped' ? { steps: 1, refinements: 0, continuations: 0, providerCalls: 0 } : null,
      usageUnknown: reason === 'interrupted', settledAt: '2026-10-15T12:00:00.1234568Z' };
    expect(capture(f).terminal).toEqual(f.entry.terminal);
  });
  it('does not round away earlier 100 ns settlement timestamps', () => {
    const f = fixture(); f.entry.stopRequested = true;
    f.entry.terminal = { reason: 'interrupted', usage: null, usageUnknown: true, settledAt: '2026-10-15T12:00:00.1234566Z' };
    expect(() => capture(f)).toThrow(/predates/);
  });
  it.each([
    { reason: 'stopped', usage: null, usageUnknown: true },
    { reason: 'interrupted', usage: { steps: 0, refinements: 0, continuations: 0, providerCalls: 0 }, usageUnknown: false },
    { reason: 'stopped', usage: { steps: -1, refinements: 0, continuations: 0, providerCalls: 0 }, usageUnknown: false },
  ])('rejects inconsistent or invented terminal usage', terminal => {
    const f = fixture(); f.entry.stopRequested = true; f.entry.terminal = { ...terminal, settledAt: '2026-10-15T12:00:01Z' };
    expect(() => capture(f)).toThrow();
  });
});

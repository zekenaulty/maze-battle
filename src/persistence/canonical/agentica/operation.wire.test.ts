// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { launchStartFixture } from './launch.test-support';
import { protocolAction, protocolResult } from './types.test-support';
import { equivalentOperationStart, equivalentOperationWire, operationEntry, validateOperationEntry, validateReservedOperationEntry } from './operation.wire';

const fixture = (): AgenticaOperationEntry => ({ request: { ...launchStartFixture(), capabilities: mazeCapabilities() },
  action: protocolAction(), admission: protocolResult(), activeEpoch: '1', state: 'parked',
  usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } });
describe('pinned service operation wire equivalence', () => {
  it('accepts typed service defaults and UTC serialization, retaining original data exactly', () => {
    const e = fixture(), wire = JSON.parse(JSON.stringify(e));
    Object.assign(wire.request.provider, { model: null, thinkingEffort: null, includeThoughtSummaries: false, geminiApi: null, thinkingEffortResolved: true });
    Object.assign(wire.request.limits, { maxRecentObservations: 6, maxRecentReceipts: 6 });
    wire.request.observation.facts = null; wire.request.observation.observedAt = '2026-10-13T00:00:00.0000000+00:00';
    for (const c of wire.request.capabilities) {
      c.durableHandoff ??= false;
      for (const f of c.inputSchema.fields) for (const k of ['description', 'allowedValues', 'example', 'minimum', 'maximum']) f[k] ??= null;
    }
    wire.admission.completion = null; wire.admission.operation = null;
    expect(equivalentOperationStart(wire.request, e.request)).toBe(true);
    expect(() => validateOperationEntry(operationEntry(wire), e.request, e.action, e.admission!)).not.toThrow();
    expect(wire.request.provider.model).toBeNull();
  });
  it.each(['model', 'thinkingEffort', 'contextWindowTokens', 'maxOutputTokens'])('rejects changed resolved provider %s', key => {
    const e = fixture(), wire = JSON.parse(JSON.stringify(e.request)); wire.provider[key] = key.endsWith('Tokens') ? 123 : 'changed';
    expect(equivalentOperationStart(wire, e.request)).toBe(false);
  });
  it('never normalizes arbitrary observation data or changed manifest defaults', () => {
    const e = fixture(), wire = structuredClone(e.request);
    wire.observation.data.extra = null; expect(equivalentOperationStart(wire, e.request)).toBe(false);
    delete wire.observation.data.extra; wire.capabilities[0].durableHandoff = true;
    expect(equivalentOperationStart(wire, e.request)).toBe(false);
  });
  it('does not hide nonzero sub-millisecond timestamp changes', () => {
    const e = fixture(), result = structuredClone(e.admission!);
    result.observation!.observedAt = '2026-10-13T00:00:00.0000001Z';
    expect(equivalentOperationWire(result, e.admission, 'result')).toBe(false);
  });
  it.each(['reserved', 'waking', 'continued', 'completed', 'blocked', 'cancelled'])('rejects state %s', state => {
    expect(() => operationEntry({ ...fixture(), state })).toThrow('not parked');
  });
  it('rejects invalid or extra usage, extra fields, wake state, and oversize input before reads', () => {
    const e = fixture();
    expect(() => operationEntry({ ...e, usage: { ...e.usage, steps: -1 } })).toThrow();
    expect(() => operationEntry({ ...e, wakeRunId: 'new-run' })).toThrow();
    expect(() => operationEntry({ ...e, extra: true } as AgenticaOperationEntry)).toThrow();
    expect(() => operationEntry({ ...e, request: { ...e.request, objective: 'x'.repeat(10240) } })).toThrow('bytes');
  });
});

describe('read-only reserved service operation validation', () => {
  const reserved = () => ({ ...fixture(), state: 'reserved', admission: null } as unknown as AgenticaOperationEntry);
  const validate = (entry: AgenticaOperationEntry) => validateReservedOperationEntry(entry, fixture().request, fixture().action);

  it('accepts exact pending custody and typed nulls without changing the wire row', () => {
    const entry = reserved();
    Object.assign(entry, { latestEvent: null, wakeRunId: null, wakeAdoption: null, stopDecision: null, settledUsage: null,
      createdAt: '2026-10-13T00:00:00.0000000+00:00', updatedAt: '2026-10-13T00:00:01Z' });
    Object.assign(entry.request.provider, { model: null, thinkingEffort: null, includeThoughtSummaries: false,
      geminiApi: null, thinkingEffortResolved: true });
    Object.assign(entry.request.limits, { maxRecentObservations: 6, maxRecentReceipts: 6 });
    entry.request.observation.observedAt = '2026-10-13T00:00:00.0000000+00:00';
    const before = structuredClone(entry);
    expect(() => validate(entry)).not.toThrow(); expect(entry).toEqual(before);
    expect(() => operationEntry(entry)).toThrow('not parked');
  });

  it.each(['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId', 'objective'] as const)(
    'rejects a changed request %s', key => {
      const entry = reserved(); Object.assign(entry.request, { [key]: 'changed' });
      expect(() => validate(entry)).toThrow('differs from original');
    });

  it.each(['actionId', 'runId', 'runnerRunId', 'stepId', 'sessionId', 'sessionEpoch', 'capabilityId', 'manifestHash', 'deadlineAt'] as const)(
    'requires the exact original action %s', key => {
      const entry = reserved(); entry.action[key] = 'changed';
      expect(() => validate(entry)).toThrow('differs from original');
    });

  it.each(['admission', 'latestEvent', 'wakeRunId', 'wakeAdoption', 'stopDecision', 'settledUsage'])(
    'rejects reserved entries with %s evidence', key => {
      const entry = reserved(); Object.assign(entry, { [key]: {} });
      expect(() => validate(entry)).toThrow('contains admission or later custody');
    });

  it.each([
    ['epoch', (e: AgenticaOperationEntry) => { e.activeEpoch = '2'; }],
    ['arguments', (e: AgenticaOperationEntry) => { e.action.arguments.row = 99; }],
    ['revision', (e: AgenticaOperationEntry) => { e.action.expectedRevision++; }],
    ['provider', (e: AgenticaOperationEntry) => { e.request.provider.maxOutputTokens++; }],
    ['limits', (e: AgenticaOperationEntry) => { e.request.limits.maxSteps++; }],
    ['observation data', (e: AgenticaOperationEntry) => { e.request.observation.data.extra = null; }],
    ['capability', (e: AgenticaOperationEntry) => { e.request.capabilities[0].durableHandoff = true; }],
    ['extra action field', (e: AgenticaOperationEntry) => { Object.assign(e.action, { extra: true }); }],
  ] as const)('rejects inconsistent %s', (_label, mutate) => {
    const entry = reserved(); mutate(entry); expect(() => validate(entry)).toThrow('differs from original');
  });

  it.each([
    ['negative steps', { steps: -1, refinements: 0, continuations: 0, providerCalls: 1 }],
    ['fractional refinements', { steps: 1, refinements: 0.5, continuations: 0, providerCalls: 1 }],
    ['string continuations', { steps: 1, refinements: 0, continuations: '0', providerCalls: 1 }],
    ['unsafe providerCalls', { steps: 1, refinements: 0, continuations: 0, providerCalls: Number.MAX_SAFE_INTEGER + 1 }],
    ['missing usage field', { steps: 1, refinements: 0, continuations: 0 }],
    ['extra usage field', { steps: 1, refinements: 0, continuations: 0, providerCalls: 1, extra: 0 }],
    ['null usage', null], ['array usage', []],
  ])('rejects malformed %s', (_label, usage) => {
    const entry = reserved(); Object.assign(entry, { usage }); expect(() => validate(entry)).toThrow();
  });

  it('rejects wrong state, malformed envelopes and oversized input', () => {
    const entry = reserved();
    expect(() => validate({ ...entry, state: 'parked' })).toThrow();
    expect(() => validate(Object.assign({}, entry, { extra: true }))).toThrow();
    expect(() => validate({ ...entry, request: null } as unknown as AgenticaOperationEntry)).toThrow();
    expect(() => validate(Object.assign({}, entry, { updatedAt: 'not-a-date' }))).toThrow();
    expect(() => validate({ ...entry, request: { ...entry.request, objective: 'x'.repeat(10240) } })).toThrow('bytes');
  });
});

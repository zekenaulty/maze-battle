// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { launchStartFixture } from './launch.test-support';
import { protocolAction, protocolResult } from './types.test-support';
import { equivalentOperationStart, equivalentOperationWire, operationEntry, validateOperationEntry } from './operation.wire';

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

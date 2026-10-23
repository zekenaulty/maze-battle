import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical, plannerPair } from './canonical-start-service.planner-compare.mjs';

const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function fixture(n, data = { scope: 'actor', actor: { level: 1, spaceId: 'entry', row: 2, column: 2 } }) {
  const time = `2026-10-22T00:00:0${n}.000+00:00`, reference = { ObservationId: id(n), Revision: 14, ObservedAt: time,
    ContentHash: hash({ observationId: id(n), revision: 14, observedAt: time, data, facts: null }) };
  const payload = { currentObservation: { Reference: reference, Data: data }, identity: { SessionId: id(n), ScopeId: id(n) },
    retention: { PrunedFactCount: 0, PrunedObservationCount: 0 }, facts: [], unknownField: 'not stripped' };
  const frameHash = hash({ ...payload, identity: { sessionId: id(n), scopeId: id(n) },
    retention: { prunedFactCount: 0, prunedObservationCount: 0 },
    currentObservation: { reference: { observationId: id(n), revision: 14, observedAt: time, contentHash: reference.ContentHash }, data } });
  return { request: { Request: { Context: { sessionId: id(n), scopeId: id(n), objectiveId: id(n) } },
    SessionContext: { RunId: 'run_' + String(n).repeat(32) }, Observations: [], Receipts: [], ToolDescriptors: [{ Name: 'fixed' }],
    ExecutionContext: { CompletedSteps: [] }, ToolSurface: { PolicySummary: { timeoutMs: 300000, elapsedMs: n, remainingTimeoutMs: 300000 - n } },
    ContextFrames: [{ Kind: 'agentica.host_context', FrameId: 'host_frame_' + frameHash, Payload: payload,
      CompactPayload: { ...structuredClone(payload), currentObservation: { Reference: structuredClone(reference), Data: null } }, EvidenceRefs: [] }] },
    refinementObservation: null };
}
const compare = (a, b, pair = plannerPair()) => pair.compare(JSON.stringify(a), JSON.stringify(b));
test('narrow identity/clock differences only; raw inputs remain intact', () => {
  const a = fixture(1), b = fixture(2), before = structuredClone([a, b]), pair = plannerPair();
  assert.deepEqual(compare(a, b, pair), []); assert.deepEqual([a, b], before); assert.ok(pair.allowances.length > 0);
});
test('gameplay change survives valid source hashes', () => {
  const a = fixture(1), b = fixture(2, { scope: 'actor', actor: { level: 1, spaceId: 'hidden', row: 2, column: 2 } });
  assert.deepEqual(compare(a, b).map(d => d.path), ['/request/ContextFrames/0/Payload/currentObservation/Data/actor/spaceId']);
});
test('new public fields, removed fields and tool changes remain differences', () => {
  const a = fixture(1), b = fixture(2); b.request.Request.Context.unknownObservedAt = '2026-01-01T00:00:00Z';
  b.request.ToolDescriptors[0].Name = 'changed'; delete b.request.ExecutionContext;
  assert.equal(compare(a, b).length, 3);
});
test('changed source digest or frame digest is not an allowed opaque identity', () => {
  for (const field of ['ContentHash', 'FrameId']) {
    const a = fixture(1), b = fixture(2), frame = b.request.ContextFrames[0];
    if (field === 'FrameId') frame.FrameId = 'host_frame_' + 'f'.repeat(64); else frame.Payload.currentObservation.Reference.ContentHash = 'f'.repeat(64);
    assert.throws(() => compare(a, b), /digest mismatch/);
  }
});
test('compact-only timestamp mutation cannot be normalized away', () => {
  const a = fixture(1), b = fixture(2);
  b.request.ContextFrames[0].CompactPayload.currentObservation.Reference.ObservedAt = '2026-10-22T00:00:05.000+00:00';
  assert.throws(() => compare(a, b), /Compact host observation reference mismatch/);
});
test('identity reuse across calls cannot become a different identity', () => {
  const pair = plannerPair(); compare(fixture(1), fixture(2), pair);
  assert.throws(() => compare(fixture(1), fixture(3), pair), /Identity alias mismatch/);
});
test('timeout budget and gameplay counters are never normalized', () => {
  const a = fixture(1), b = fixture(2); b.request.ToolSurface.PolicySummary.timeoutMs++;
  assert.throws(() => compare(a, b), /timeout budget/);
  b.request.ToolSurface.PolicySummary.timeoutMs--; b.request.ToolSurface.PolicySummary.remainingStepBudget = 1;
  assert.equal(compare(a, b).length, 1);
});
test('embedded frontier tokens retain unknown fields and selected coordinates', () => {
  const data = n => ({ scope: 'frontiers', frontiers: [{ frontier: JSON.stringify({ schema: 1,
    publication: { id: id(n), key: 'agentica/publications/' + id(n) },
    selection: { at: { cell: { spaceId: 'entry', row: 2, column: n } }, source: { id: id(n), index: 29 } },
    unknown: id(n) }) }] });
  const differences = compare(fixture(1, data(1)), fixture(2, data(2)));
  assert.deepEqual(differences.map(d => d.path), [
    '/request/ContextFrames/0/Payload/currentObservation/Data/frontiers/0/frontier/selection/at/cell/column',
    '/request/ContextFrames/0/Payload/currentObservation/Data/frontiers/0/frontier/unknown']);
});

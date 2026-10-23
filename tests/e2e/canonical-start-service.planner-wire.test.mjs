import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlannerWindows } from './canonical-start-service.planner-wire.mjs';

function fixture() {
  const root = 'session', identity = { sessionId: root, scopeId: 'scope', objectiveId: 'objective', perspectiveId: 'party' };
  const external = ['labrun_initial', 'labrun_successor'], internal = ['run_' + '1'.repeat(32), 'run_' + '2'.repeat(32)];
  const observation = { observationId: 'observed', revision: 14, observedAt: '2026-10-22T00:00:00.000Z', data: { scope: 'actor' } };
  const admitted = { actionId: 'action-3', sessionId: root, evidenceId: 'result', beforeRevision: 14, afterRevision: 27,
    observation, operation: { operationId: 'travel', summary: 'admitted' } };
  const wake = { sessionId: root, actionId: 'action-3', operationId: 'travel', eventId: 'decision', observation };
  const usage = { steps: 4, refinements: 3, continuations: 1, providerCalls: 0 };
  const sent = [{ type: 'start.durable', requestId: 'start', payload: { request: identity } },
    { type: 'action.result', runId: external[0], payload: admitted }, { type: 'operation.wake', requestId: 'wake', payload: wake }];
  const starts = external.map((runId, index) => ({ type: 'started', runId, requestId: index ? 'wake' : 'start',
    payload: { ...identity, runId, ...(index ? { usage, continuation: {
      parentRunId: external[0], admissionActionId: 'action-3', operationId: 'travel', wakeEventId: 'decision' } } : {}) } }));
  const received = [...starts, ...external.flatMap((runId, index) => [
    { type: 'execution.event', runId, payload: { type: 'run.created', data: { run: internal[index] }, context: { runId: internal[index] } } },
    ...Array.from({ length: 4 }, (_, call) => ({ type: 'action.request', runId,
      payload: { runId, runnerRunId: internal[index], actionId: 'action-' + (index * 4 + call) } }))])];
  const typedObservation = { ...observation, facts: null, observedAt: '2026-10-22T00:00:00+00:00' };
  const continuation = { parentRunId: external[0], adoption: null, cumulativeUsage: usage,
    admission: { ...admitted, completion: null, observation: typedObservation, operation: { ...admitted.operation, usage: null } },
    wake: { ...wake, completion: null, nextSessionEpoch: null, observation: typedObservation } };
  const entries = Array.from({ length: 8 }, (_, i) => ({ root, window: internal[Math.floor(i / 4)], call: i % 4,
    method: i % 4 ? 'refine' : 'create', raw: JSON.stringify({ request: { SessionContext: { RunId: internal[Math.floor(i / 4)] },
      Request: { Context: { ...identity, continuation: i < 4 ? null : continuation } } } }) }));
  return { root, entries, sent, received };
}
const check = f => assertPlannerWindows(f.root, f.entries, f.sent, f.received);
function changeRequest(f, index, change) {
  const value = JSON.parse(f.entries[index].raw); change(value.request); f.entries[index].raw = JSON.stringify(value);
}
test('both windows bind to independent run events and exact continuation wire without mutation', () => {
  const f = fixture(), before = structuredClone(f); check(f); assert.deepEqual(f, before);
});
test('self-consistent renamed capture window still refuses the wrong runner identity', () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) {
    f.entries[i].window = 'run_' + '3'.repeat(32);
    changeRequest(f, i, request => { request.SessionContext.RunId = f.entries[i].window; });
  }
  assert.throws(() => check(f), /independent run.created/);
});
test('duplicate per-window call indexes refuse', () => {
  const f = fixture(); f.entries[5].call = 0; assert.throws(() => check(f), /Per-window call indexes/);
});
test('parent, admission, wake source and usage changes refuse despite internally consistent capture metadata', () => {
  for (const change of [c => { c.parentRunId = 'foreign'; }, c => { c.admission.evidenceId = 'foreign'; },
    c => { c.admission.beforeRevision++; }, c => { c.wake.eventId = 'foreign'; },
    c => { c.wake.observation.observedAt = '2026-10-22T00:00:01+00:00'; },
    c => { c.wake.observation.observedAt = '2026-10-22T00:00:00.0000001+00:00'; },
    c => { c.wake.observation.data.hidden = true; }, c => { c.cumulativeUsage.steps++; }]) {
    const f = fixture(); changeRequest(f, 4, request => change(request.Request.Context.continuation));
    assert.throws(() => check(f));
  }
});
test('mismatched or duplicate service mapping and unrelated wake replies refuse', () => {
  for (const change of [f => { f.received[2].payload.context.runId = 'run_' + '3'.repeat(32); },
    f => { f.received.push(structuredClone(f.received[2])); }, f => { f.received[1].requestId = 'unrelated'; }]) {
    const f = fixture(); change(f); assert.throws(() => check(f));
  }
});

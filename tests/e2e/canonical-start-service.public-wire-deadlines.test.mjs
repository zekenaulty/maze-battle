import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from './canonical-start-service.planner-compare.mjs';
import { assertOriginalDeadlines } from './canonical-start-service.public-wire-deadlines.mjs';

function fixture() {
  const request = { actionId: 'action-1', runId: 'run-1', sessionId: 'session-1', sessionEpoch: '3',
    deadlineAt: '2026-10-23T12:00:30.000Z' };
  const custody = [{ hostId: 'maze', sessionId: 'session-1', sessionEpoch: '3', runId: 'run-1', objectiveId: 'quest',
    reservedAt: '2026-10-23T12:00:00.010Z', request, requestHash: 'sha256:' + createHash('sha256').update(canonical(request)).digest('hex') }];
  const world = { sent: [{ type: 'start.durable', payload: { request: { hostId: 'maze', sessionId: 'session-1',
    objectiveId: 'quest', limits: { actionTimeoutSeconds: 30 } } } }], received: ['action.request', 'action.pending']
    .map(type => ({ type, runId: 'run-1', payload: structuredClone(request) })) };
  return { raw: [world], custody };
}
test('matches each deadline to the independently retained original request and grant', () => {
  const f = fixture(); assert.equal(assertOriginalDeadlines(f.raw, f.custody).length, 2);
});
for (const mode of ['request-only', 'request-and-pending', 'forged-original', 'extended-source-allowance', 'missing-source', 'wrong-root'])
  test(`deadline mutation cannot be normalized: ${mode}`, () => {
    const f = fixture();
    if (mode === 'request-only') f.raw[0].received[0].payload.deadlineAt = '2026-10-23T13:00:30.000Z';
    if (mode === 'request-and-pending') for (const frame of f.raw[0].received) frame.payload.deadlineAt = '2026-10-23T13:00:30.000Z';
    if (mode === 'forged-original') f.custody[0].request.deadlineAt = '2026-10-23T13:00:30.000Z';
    if (mode === 'extended-source-allowance') {
      for (const frame of f.raw[0].received) frame.payload.deadlineAt = '2026-10-23T13:00:30.000Z';
      f.custody[0].request.deadlineAt = '2026-10-23T13:00:30.000Z';
      f.custody[0].requestHash = 'sha256:' + createHash('sha256').update(canonical(f.custody[0].request)).digest('hex');
    }
    if (mode === 'missing-source') f.custody.length = 0;
    if (mode === 'wrong-root') f.custody[0].objectiveId = 'other';
    assert.throws(() => assertOriginalDeadlines(f.raw, f.custody));
  });

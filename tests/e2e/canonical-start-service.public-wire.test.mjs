import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from './canonical-start-service.planner-compare.mjs';
import { comparePublicPayloads, assertPublicWireDisclosure } from './canonical-start-service.public-wire.mjs';

const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const run = n => 'labrun_' + String(n).repeat(32);
const frame = (type, payload, n) => ({ type, payload, runId: run(n), protocolVersion: 1 });
const fixture = n => ({ sent: [frame('action.result', { actionId: 'action_' + String(n).repeat(32),
  disposition: 'applied', afterRevision: 14, observation: { observationId: id(n), revision: 14,
    observedAt: `2026-10-22T00:00:0${n}.000Z`, data: { scope: 'actor', actor: { level: 1, row: 2, column: 2 } } } }, n)],
  received: [frame('status', { status: 'running' }, n), frame('action.accepted', { actionId: 'action_' + String(n).repeat(32), duplicate: false }, n)], progress: [] });
const compare = (a, b) => comparePublicPayloads([a, b]);

test('only declared identity/time paths vary; raw frames and order stay intact', () => {
  const a = fixture(1), b = fixture(2), before = structuredClone([a, b]), result = compare(a, b);
  assert.deepEqual(result.differences, []); assert.deepEqual([a, b], before); assert.ok(result.allowances.length);
});

test('pre-disclosure status/ACK interleaving is retained as a strict failure', () => {
  const a = fixture(1), b = fixture(2); b.received.reverse();
  const result = compare(a, b);
  assert.ok(result.differences.some(d => d.path === '/received/0/type'));
  assert.throws(() => assertPublicWireDisclosure(result));
});

test('status, error, diagnostic, gameplay and unknown fields are never discarded', () => {
  const a = fixture(1), b = fixture(2);
  b.received[0].payload.status = 'failed'; b.received[0].payload.diagnostics = { hidden: 1 };
  b.received[0].payload.unknownObservedAt = '2026-01-01T00:00:00Z';
  b.sent[0].payload.observation.data.actor.row++;
  b.received.push(frame('error', { message: 'hidden destination' }, 2));
  assert.equal(compare(a, b).differences.length, 5);
});

test('new nested storage work is refused even when equal in both worlds', () => {
  for (const field of ['readBytes', 'writeBytes', 'reads', 'writes', 'usedBytes', 'reservedBytes', 'workStats',
    'allocatedBytes', 'consumedBytes', 'privateCapacity', 'privateAllocation', 'preparationLineage']) {
    const a = fixture(1), b = fixture(2);
    for (const v of [a, b]) v.received[0].payload.diagnostics = { [field]: 1 };
    assert.throws(() => compare(a, b), /storage work disclosure/);
  }
});

test('message loss, duplicate and changed ACK binding cannot normalize away', () => {
  for (const change of [b => b.received.pop(), b => b.received.push(b.received[1]),
    b => { b.received[1].payload.actionId = 'action_' + '3'.repeat(32); }]) {
    const a = fixture(1), b = fixture(2); change(b);
    assert.throws(() => { const result = compare(a, b); assert.deepEqual(result.differences, []); });
  }
});

test('start digest must match the whole raw request before allowing derived identity', () => {
  const a = fixture(1), b = fixture(2);
  for (const [n, v] of [[1, a], [2, b]]) {
    const request = { sessionId: id(n), limits: { maxSteps: 64 } };
    const hash = 'sha256:' + createHash('sha256').update(canonical(request)).digest('hex');
    v.received.unshift(frame('started', { startAdmission: { originalRequest: request, acceptedRequest: request,
      originalRequestHash: hash, acceptedRequestHash: hash } }, n));
  }
  assert.deepEqual(compare(a, b).differences, []);
  b.received[0].payload.startAdmission.originalRequest.limits.maxSteps++;
  assert.throws(() => compare(a, b), /Start digest/);
});

test('elapsed receipt time is distinct from limits/counters and unknown time fields', () => {
  const a = fixture(1), b = fixture(2);
  for (const [n, v] of [[1, a], [2, b]]) v.received.push(frame('execution.event', {
    type: 'receipt.emitted', payload: { durationMs: n }, diagnostics: null }, n));
  assert.deepEqual(compare(a, b).differences, []);
  b.received[2].payload.payload.remainingSteps = 12;
  assert.deepEqual(compare(a, b).differences.map(d => d.path), ['/received/2/payload/payload/remainingSteps']);
});

test('embedded frontier unknown fields and a changed source index stay visible', () => {
  const a = fixture(1), b = fixture(2);
  for (const [n, v] of [[1, a], [2, b]]) v.sent[0].payload.observation.data = { scope: 'frontiers', frontiers: [{
    frontier: JSON.stringify({ schema: 1, publication: { id: id(n), key: 'agentica/publications/' + id(n) },
      selection: { source: { id: id(n), index: n } }, unknown: id(n) }) }] };
  assert.deepEqual(compare(a, b).differences.map(d => d.path), [
    '/sent/0/payload/observation/data/frontiers/0/frontier/selection/source/index',
    '/sent/0/payload/observation/data/frontiers/0/frontier/unknown']);
});

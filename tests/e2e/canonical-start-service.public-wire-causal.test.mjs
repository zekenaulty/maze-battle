import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCausalPublicPayloads } from './canonical-start-service.public-wire-causal.mjs';
import { comparePublicPayloads } from './canonical-start-service.public-wire.mjs';

const run = 'labrun_' + '1'.repeat(32), actionId = 'action_' + '1'.repeat(32);
const frame = (type, payload) => ({ type, payload, runId: run, requestId: null, protocolVersion: 1 });
const pending = frame('action.pending', { actionId, runId: run, runnerRunId: 'run_' + '1'.repeat(32), stepId: 'step-1' });
const running = frame('status', { status: 'running' });
const direct = frame('action.accepted', { actionId, duplicate: false });
const evidence = frame('action.accepted', { actionId, disposition: 'applied', evidenceId: 'result-' + '1'.repeat(64), afterRevision: 14 });
const observation = frame('execution.event', { type: 'observation.made', context: { stepId: 'step-1' }, sequence: 6 });
const payload = middle => ({ sent: [frame('action.result', structuredClone(evidence.payload))],
  received: structuredClone([pending, ...middle, observation]), progress: [] });
const pair = () => [payload([running, evidence, direct]), payload([evidence, direct, running])];
const noResiduals = raw => assert.deepEqual(compareCausalPublicPayloads(raw).differences, []);

test('records a complete bounded correspondence and preserves the original strict failure', () => {
  const raw = pair(), before = structuredClone(raw), result = compareCausalPublicPayloads(raw);
  assert.deepEqual(result.correspondence.mapping, [0, 3, 1, 2, 4]);
  assert.equal(result.correspondence.blocks.length, 1); assert.deepEqual(result.differences, []);
  assert.deepEqual(raw, before); assert.ok(comparePublicPayloads(raw).differences.length);
});

test('two ACKs can exchange while unrelated core events and source order stay strict', () => {
  const raw = [payload([direct, evidence]), payload([evidence, direct])]; noResiduals(raw);
  raw[1].received.at(-1).payload.sequence++;
  assert.throws(() => noResiduals(raw));
});

for (const [name, change] of Object.entries({
  'missing ACK': raw => raw[1].received.splice(2, 1),
  'extra ACK': raw => raw[1].received.splice(2, 0, structuredClone(direct)),
  'changed action binding': raw => { raw[1].received[1].payload.actionId = 'action_' + '2'.repeat(32); },
  'changed evidence': raw => { raw[1].received[1].payload.afterRevision++; },
  'changed duplicate flag': raw => { raw[1].received[2].payload.duplicate = true; },
  'new ACK field': raw => { raw[1].received[2].payload.extra = 'hidden'; },
  'new envelope field': raw => { raw[1].received[1].extra = 'hidden'; },
  'correlated ACK': raw => { raw[1].received[2].requestId = 'request-1-1'; },
  'non-running status': raw => { raw[1].received[3].payload.status = 'stopped'; },
  'foreign pending action': raw => { raw[1].received[0].payload.actionId = 'action_' + '2'.repeat(32); },
  'crossing core event': raw => { const rows = raw[1].received; [rows[2], rows[4]] = [rows[4], rows[2]]; },
  'crossing terminal': raw => { raw[1].received[3] = frame('run.terminated', {}); },
  'ambiguous running status': raw => { for (const value of raw) value.received.splice(2, 0, structuredClone(running)); },
  'unrecognized storage counters': raw => { for (const value of raw) value.received[1].payload.readBytes = 1; },
  'wrong original evidence in both worlds': raw => { for (const value of raw) value.sent[0].payload.afterRevision++; },
})) test(`${name} cannot disappear under correspondence`, () => {
  const raw = pair(); change(raw); assert.throws(() => noResiduals(raw));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptFrame } from './agentica-fixture-context.mjs';

const scopeId = '42413a39-3485-4210-9ec8-8e2b06b8c8af';
const frame = { checkpoint: { scopeId, revision: 7 }, knowledge: {}, observation: {} };
const reference = { ObservationId: 'observed-one', Revision: 7, ContentHash: 'hash-one' };
const request = (data = frame, refinement = false, result, extra = {}) => ({ input: [{ role: 'user', content: [{ type: 'input_text', text:
  `Projected context frames:\n${JSON.stringify([{ payload: { identity: { ScopeId: scopeId, SessionEpoch: '0' }, currentObservation: { Reference: reference, Data: data } } }], null, 2)}\n\nCurrent planning constraints:\n{}\nNew observation:\n${JSON.stringify(extra.latest ?? { data: { result } })}\nExisting observations:\n[]\nExisting receipts:\n${JSON.stringify(extra.receipts ?? [])}\nRequired JSON shape:\n${refinement ? '"refinedPlan"' : '{}'}` }] }] });

test('reads the indented, case-sensitive public host projection', () => {
  assert.deepEqual(promptFrame(request()), { frame, scope: scopeId, epoch: '0', reference, recovered: false, direct: false, compacted: false, refinement: false });
  assert.equal(promptFrame(request(frame, true)).refinement, true);
});
test('refuses hidden geometry and non-opaque scope identity', () => {
  assert.throws(() => promptFrame(request({ ...frame, seed: 123 })), /Private world/);
  assert.throws(() => promptFrame(request({ ...frame, checkpoint: { scopeId: 'seed:123' } })), /identity mismatch/);
});
test('does not manufacture missing or compacted context', () => {
  assert.throws(() => promptFrame({ input: 'nothing' }), /Expected normal/);
  assert.throws(() => promptFrame({ input: [{ role: 'user', content: 'Projected context frames:\n[]' }] }), /bounded/);
  assert.throws(() => promptFrame(request({})), /identity mismatch/);
  assert.equal(promptFrame(request(null)).frame, null);
});
test('recovers compacted evidence only from the exact current source receipt', () => {
  const result = { status: 'available', reference: { observationId: reference.ObservationId, contentHash: reference.ContentHash, revision: 7 },
    observation: { observationId: reference.ObservationId, revision: 7, data: frame } };
  assert.equal(promptFrame(request(null, true, result)).recovered, true);
  assert.deepEqual(promptFrame(request(null, true, result)).frame, frame);
  assert.equal(promptFrame(request(null, true, { ...result, status: 'not_retained' })).frame, null);
  assert.equal(promptFrame(request(null, true, { ...result, reference: { ...result.reference, contentHash: 'wrong' } })).frame, null);
});
test('uses the latest user prompt in stateless continuation history', () => {
  const stale = request({ ...frame, checkpoint: { scopeId, revision: 0 } }).input;
  assert.equal(promptFrame({ input: [...stale, ...request().input] }).frame.checkpoint.revision, 7);
  const assistant = { ...stale[0], role: 'assistant' };
  assert.equal(promptFrame({ input: [...request().input, assistant] }).frame.checkpoint.revision, 7);
  assert.throws(() => promptFrame({ input: [...request().input, { role: 'user', content: 'malformed latest prompt' }] }), /Expected normal/);
  assert.equal(promptFrame({ input: [...request(frame, true).input, ...request().input] }).refinement, false);
  assert.equal(promptFrame({ input: [...request().input, ...request(null).input] }).frame, null);
});
test('reuses a current compacted action observation only with its matching receipt', () => {
  const data = { actionId: 'a', hostEvidenceId: 'e', observationId: reference.ObservationId, afterRevision: 7,
    effectUnresolved: false, observation: { observationId: reference.ObservationId, revision: 7, data: frame } };
  const extra = { latest: { data, evidence: [{ kind: 'receipt', refId: 'r' }] }, receipts: [{ receiptId: 'r', data }] };
  assert.equal(promptFrame(request(null, true, undefined, extra)).direct, true);
  assert.equal(promptFrame(request(null, true, undefined, { ...extra, receipts: [] })).direct, false);
  assert.equal(promptFrame(request(null, true, undefined, { ...extra, receipts: [{ receiptId: 'wrong', data }] })).direct, false);
  assert.equal(promptFrame(request(null, true, undefined, { ...extra, latest: { ...extra.latest, data: { ...data, effectUnresolved: true } } })).direct, false);
});

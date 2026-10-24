import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LiveBudget } from './budget.mjs';
import { observeWire, stopThroughUi } from './wire.mjs';

function fixture() {
  const page = new EventEmitter(), socket = new EventEmitter(), budget = new LiveBudget();
  socket.url = () => 'ws://127.0.0.1:5078/api/host';
  const wire = observeWire(page, budget); page.emit('websocket', socket);
  return { budget, wire, emit: (record, droppedRecords = 0) => socket.emit('framereceived',
    { payload: JSON.stringify({ type: 'progress', runId: 'original', payload: { record, droppedRecords } }) }) };
}
test('original lossy-display sequence retains terminal usage without cancelling the run', () => {
  const { budget, wire, emit } = fixture();
  emit({ callId: 'one', kind: 'started' });
  emit({ callId: 'one', kind: 'text_delta', outputCharacters: 200 }, 10);
  emit({ callId: 'one', kind: 'completed', usage: { promptTokens: 4201, outputTokens: 681, thinkingTokens: 423 } }, 10);
  budget.reconcileService([{ runId: 'original', sessionId: 'session', usage: { providerCalls: 1 } }], new Set(['original']));
  assert.equal(budget.check({ admission: true }).inputTokens, 4201);
  assert.deepEqual(wire.errors, []); assert.equal(wire.received.length, 3);
  assert.equal(wire.received[1].frame.payload.droppedRecords, 10);
});
test('real cancelled attempt stays unknown despite lossy intermediate telemetry', () => {
  const { budget, emit } = fixture();
  emit({ callId: 'original-third', kind: 'started' });
  emit({ callId: 'original-third', kind: 'text_delta' }, 10);
  assert.throws(() => budget.check({ admission: true }), /Reconcile/);
  emit({ callId: 'original-third', kind: 'cancelled', usage: null }, 10);
  assert.throws(() => budget.check({ admission: true }), /cancelled/);
  const state = budget.snapshot(); assert.equal(state.calls, 1);
  assert.equal(state.attempts[0].usage, null); assert.equal(state.unresolved.length, 1);
});
test('started sessions cannot report cleanup success with an absent or failed UI', async () => {
  for (const isVisible of [async () => false, async () => { throw Error('detached page'); }]) {
    const page = { getByRole: () => ({ isVisible }) };
    await assert.rejects(stopThroughUi(page, true), /recovery required/);
    await stopThroughUi(page, false);
  }
});

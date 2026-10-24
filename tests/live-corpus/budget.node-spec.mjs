import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveBudget, APPROVED_LIMITS } from './budget.mjs';

const usage = { promptTokens: 10_000, outputTokens: 1000, thinkingTokens: 500 };
test('approved limits remain exactly the owner-confirmed cumulative ceilings', () => {
  assert.deepEqual(APPROVED_LIMITS, { calls: 64, inputTokens: 1_100_000,
    outputTokens: 262_144, estimatedUsd: 1, durationMs: 1_800_000 });
});
test('calls deduplicate and thinking tokens do not double-charge output', () => {
  const b = new LiveBudget(); b.begin();
  b.record('run', { callId: 'one', kind: 'started' });
  assert.throws(() => b.check({ admission: true }), /Reconcile/);
  for (let n = 0; n < 2; n++) b.record('run', { callId: 'one', kind: 'completed', usage });
  b.reconcileService([{ runId: 'run', sessionId: 'session', usage: { providerCalls: 1 } }], new Set(['run']));
  const s = b.check({ admission: true });
  assert.equal(s.calls, 1); assert.equal(s.inputTokens, 10_000);
  assert.equal(s.outputTokens, 1000); assert.equal(s.estimatedUsd, 0.0015);
});
test('unknown and failed provider usage blocks further admission', () => {
  for (const event of [{ kind: 'completed' }, { kind: 'failed' }, { kind: 'cancelled' }]) {
    const b = new LiveBudget(); b.record('run', { callId: 'one', ...event });
    assert.throws(() => b.check({ admission: true }));
  }
});
test('call ceiling is cumulative across distinct dungeon runs', () => {
  const b = new LiveBudget({ ...APPROVED_LIMITS, calls: 2 });
  b.record('A', { callId: 'one', kind: 'completed', usage });
  b.reconcileService([{ runId: 'A', sessionId: 'A', usage: { providerCalls: 1 } }], new Set(['A']));
  b.check({ admission: true });
  b.record('B', { callId: 'one', kind: 'started' });
  assert.throws(() => b.check(), /ceiling/);
});
test('elapsed ceiling does not reset at a new execution window', () => {
  let now = 0; const b = new LiveBudget(APPROVED_LIMITS, () => now);
  b.begin(); now = 1_800_000; b.begin(); assert.throws(() => b.check(), /ceiling/);
});
test('each token/cost ceiling independently stops the coordinator', () => {
  for (const limits of [{ inputTokens: 10_000 }, { outputTokens: 1000 }, { estimatedUsd: 0.0015 }]) {
    const b = new LiveBudget({ ...APPROVED_LIMITS, ...limits });
    b.record('run', { callId: 'one', kind: 'completed', usage });
    assert.throws(() => b.check(), /ceiling/);
  }
});
test('lossy display deltas do not fabricate missing terminal usage', () => {
  const b = new LiveBudget(); b.begin(); b.observeDrops('A', 10);
  b.record('A', { callId: 'one', kind: 'started' });
  b.record('A', { callId: 'one', kind: 'completed', usage });
  b.reconcileService([{ runId: 'A', sessionId: 'session', usage: { providerCalls: 1 } }], new Set(['A']));
  assert.equal(b.check({ admission: true }).calls, 1);
  assert.deepEqual(b.snapshot().telemetryDrops, { A: 10 });
});
test('missing complete calls are detected using source cumulative counts, not sums across wakes', () => {
  const b = new LiveBudget(); b.record('A', { callId: 'one', kind: 'completed', usage });
  b.reconcileService([{ runId: 'A', sessionId: 'same', usage: { providerCalls: 1 } },
    { runId: 'wake', sessionId: 'same', usage: { providerCalls: 2 } }], new Set(['A', 'wake']));
  assert.throws(() => b.check({ admission: true }), /provider-call count/);
  b.record('wake', { callId: 'two', kind: 'completed', usage });
  assert.equal(b.check({ admission: true }).calls, 2);
});
test('missing fresh snapshots cannot reuse cached counters or bypass accounting', () => {
  const b = new LiveBudget(); b.record('A', { callId: 'one', kind: 'completed', usage });
  assert.throws(() => b.check({ admission: true }), /authoritative run snapshots/);
  assert.throws(() => b.reconcileService([], new Set(['A'])), /Missing/);
  b.reconcileService([{ runId: 'A', sessionId: 'session', usage: { providerCalls: 1 } }], new Set(['A']));
  b.check({ admission: true });
  assert.throws(() => b.reconcileService([], new Set(['A'])), /Missing/);
  assert.throws(() => b.check({ admission: true }), /snapshots/);
  assert.throws(() => b.reconcileService([], new Set()), /snapshots/);
});

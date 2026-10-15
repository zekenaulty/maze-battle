import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

for (const state of ['continued', 'completed', 'blocked', 'cancelled'] as const) {
  test(`verified root Stop discharges exact ${state} navigation after a lost correlated claim without granting actions`, async ({ page }) => {
    const before = await seedRootStop(page, { state });
    const result = await page.evaluate(async action => {
      const c = window.canonicalDecisionController, count = c.calls().length, ack = await c.acknowledge();
      const save = await c.wait(c.begin('save', action)), effect = await c.wait(c.begin('action', action));
      return { ack, save, effect, state: await c.state(), root: await c.rootState(), retained: await c.retained(action), calls: c.calls().slice(count) };
    }, before.action);
    expect(before.state.claim).toBeNull(); expect(before.state.grant).toBeNull();
    expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.state.operation.state).toBe('acknowledged');
    expect(result.state.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop',
      decision: { intent: before.state.intent!.reference, claim: null, rootAcknowledgement: before.root.acknowledgement!.source.attemptId },
      remote: { state, stopped: false } } });
    expect(result.state.acknowledgement!.receipt.beforeRevision).toBeGreaterThanOrEqual(before.root.acknowledgement!.receipt.afterRevision);
    expect(result.root.acknowledgement).toEqual(before.root.acknowledgement);
    expect(result.state.intent).toEqual(before.state.intent); expect(result.state.terminal).toEqual(before.state.terminal);
    expect(result.state.head.allocations[result.state.operation.id]).toBeUndefined();
    expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
    expect(result.save.status).toBe('rejected'); expect(result.effect.status).toBe('rejected'); expect(result.retained).toBeNull();
    expect(result.calls.map(c => c.method)).toEqual(['list']);
  });
}

test('verified root Stop accepts only the exact suppressed no-wake cancellation without inventing a claim', async ({ page }) => {
  const before = await seedRootStop(page, { mode: 'suppressed' });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, ack = await c.acknowledge();
    return { ack, state: await c.state(), remote: c.remote(), calls: c.calls() };
  });
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  expect(result.remote.activations).toBe(0); expect(result.remote.entry.wakeRunId).toBeUndefined();
  expect(result.remote.entry.stopDecision).toEqual(before.state.intent!.data.event);
  expect(result.state.acknowledgement!.source.input).toMatchObject({ proof: { remote: { runId: null, settledUsage: null, stopped: true },
    decision: { intent: before.state.intent!.reference, claim: null, rootAcknowledgement: before.root.acknowledgement!.source.attemptId } } });
  expect(result.calls.filter(c => c.method !== 'close').map(c => c.method)).toEqual(['list']);
});

test('admitted child evidence never invokes parent StopDecision and keeps the retained claim immutable', async ({ page }) => {
  const before = await seedRootStop(page, { mode: 'claimed', state: 'continued' });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, count = c.calls().length, ack = await c.acknowledge();
    return { ack, state: await c.state(), calls: c.calls().slice(count) };
  });
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.state.claim).toEqual(before.state.claim);
  expect(result.state.acknowledgement!.source.input).toMatchObject({ proof: { decision: { claim: before.state.claim!.reference } } });
  expect(result.state.grant).toBeNull(); expect(result.calls.map(c => c.method)).toEqual(['list']);
});

test('verified root Stop discharges a lost new-owner adoption using its retained intent without granting authority', async ({ page }) => {
  const before = await seedRootStop(page, { newOwner: true });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, ack = await c.acknowledge();
    return { ack, state: await c.state(), remote: c.remote(), calls: c.calls() };
  });
  expect(before.state.intent!.data.adoption).not.toBeNull();
  expect(result.remote.entry.wakeAdoption).toEqual(before.state.intent!.data.adoption);
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.state.intent).toEqual(before.state.intent);
  expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  expect(result.calls.some(c => c.method === 'stop-decision')).toBe(false);
});

test('real successor navigation admitted before predecessor ACK keeps its own funding after root Stop discharge', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.pulse(); const child = await c.completeSuccessor(await c.draft());
    const original = await c.state(); c.settle('continued'); await c.wait(c.begin('cancel'));
    await c.fillQuota(); await c.acknowledgeRoot(await c.rootEntry());
    const before = await c.funding(child.seed.operationId), count = c.calls().length, ack = await c.acknowledge();
    return { child, original, before, ack, after: await c.funding(child.seed.operationId), state: await c.state(), calls: c.calls().slice(count) };
  });
  expect(result.child.progress).toMatchObject({ steps: 3, status: 'arrived' }); expect(result.original.operation.state).toBe('settled');
  expect(result.before.child!.state).toBe('settled'); expect(result.before.head.allocations[result.before.child!.id].bytes).toBeGreaterThan(0);
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.after.navigation!.state).toBe('acknowledged');
  expect(result.after.head.allocations[result.after.navigation!.id]).toBeUndefined();
  expect(result.after.child).toEqual(result.before.child);
  expect(result.after.head.allocations[result.after.child!.id]).toEqual(result.before.head.allocations[result.before.child!.id]);
  expect(result.state.grant!.record).toEqual(result.original.grant!.record);
  expect(result.state.selection).toEqual(result.original.selection); expect(result.calls.map(c => c.method)).toEqual(['list']);
});

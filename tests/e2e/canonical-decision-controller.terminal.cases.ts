import { test, expect } from './canonical-decision-controller.test';

for (const state of ['continued', 'completed', 'blocked', 'cancelled'] as const) {
  test(`fast ${state} successor remains claimable and acknowledgeable but never grants actions`, async ({ page }) => {
    const result = await page.evaluate(async state => {
      const c = window.canonicalDecisionController; await c.boot(); c.configure({ fastState: state });
      await c.create(); await c.prepare(await c.publish()); await c.pulse();
      const claimed = await c.pulse(), settled = await c.pulse(), beforeAck = await c.state(), action = await c.draft();
      const save = await c.wait(c.begin('save', action)), ack = await c.acknowledge();
      return { claimed, settled, beforeAck, save, ack, after: await c.state(), retained: await c.retained(action), control: c.control(), calls: c.calls() };
    }, state);
    expect(result.settled).toMatchObject({ status: 'successor-settled', state });
    expect(result.claimed.status).toBe('claimed');
    expect(result.beforeAck.claim!.data).toMatchObject({ state, settledUsage: { continuations: 1 } });
    expect(result.beforeAck.grant).toBeNull(); expect(result.save.status).toBe('rejected'); expect(result.retained).toBeNull();
    expect(result.control.binding).toBeNull(); expect(result.after.grant).toBeNull();
    expect(result.after.operation.state).toBe('acknowledged'); expect(result.after.launch.guard.state).toBe('admitted');
    expect(result.calls.some(c => c.method === 'stop-decision')).toBe(false);
  });
}

test('Stop during the wake reply barrier cancels the funded local guard before explicit remote Stop', async ({ page }) => {
  const jobs = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); c.hold('wake:after'); const pulse = c.begin('pulse'); await c.entered('wake:after');
    const action = await c.draft(), save = c.begin('save', action), cancel = c.begin('cancel');
    return { pulse, action, save, cancel };
  });
  const stopped = await page.evaluate(async jobs => {
    const c = window.canonicalDecisionController, cancelled = await c.wait(jobs.cancel), save = await c.wait(jobs.save);
    return { cancelled, save, state: await c.state(), calls: c.calls(), retained: await c.retained(jobs.action) };
  }, jobs);
  expect(stopped.save.status).toBe('rejected');
  expect(stopped.state.launch.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(stopped.state.grant).toBeNull(); expect(stopped.retained).toBeNull();
  expect(stopped.calls.some(c => c.method === 'stop-decision')).toBe(false);
  const recovered = await page.evaluate(async jobs => {
    const c = window.canonicalDecisionController; c.release('wake:after'); const pulse = await c.wait(jobs.pulse);
    const ack = await c.acknowledge(); return { pulse, ack, state: await c.state(), calls: c.calls(), remote: c.remote() };
  }, jobs);
  expect(recovered.state.grant).toBeNull();
  expect(recovered.state.launch.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(recovered.state.operation.state).toBe('acknowledged');
  expect(recovered.remote.activations).toBe(1);
  expect(recovered.calls.find(c => c.method === 'stop-decision')!.observed).toMatchObject({ guard: { terminal: { disposition: 'cancelled' } } });
});

test('terminal after attachment fences fresh effects while preserving actual-entry ACK', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.pulse(); const before = await c.state();
    c.settle('completed'); c.emitTerminal(); const action = await c.draft(), save = await c.wait(c.begin('save', action));
    const ack = await c.acknowledge(); return { before, save, ack, state: await c.state(), retained: await c.retained(action) };
  });
  expect(result.before.grant).not.toBeNull(); expect(result.save.status).toBe('rejected'); expect(result.retained).toBeNull();
  expect(result.state.operation.state).toBe('acknowledged');
  expect(result.state.grant!.record.ref).toEqual(result.before.grant!.record.ref);
});

test('Stop after handoff ACK still sends the exact remote stopDecision before reporting recovery settled', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.pulse(); await c.acknowledge(); const acknowledged = await c.state();
    await c.wait(c.begin('cancel')); const before = c.calls(); await c.acknowledge();
    return { acknowledged, before, calls: c.calls(), remote: c.remote(), after: await c.state() };
  });
  expect(result.acknowledged.operation.state).toBe('acknowledged');
  expect(result.before.some(c => c.method === 'stop-decision')).toBe(false);
  expect(result.calls.filter(c => c.method === 'stop-decision')).toHaveLength(1);
  expect(result.remote.entry.stopDecision).toEqual(result.after.intent!.data.event); expect(result.remote.entry.state).toBe('cancelled');
  expect(result.after.operation).toEqual(result.acknowledged.operation);
});

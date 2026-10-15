import { test, expect } from './canonical-decision-controller.test';

for (const field of ['scopeId', 'manifestHash', 'sessionId'] as const) {
  test(`wrong started ${field} never retains a claim or releases queued actions`, async ({ page }) => {
    const result = await page.evaluate(async field => {
      const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
      c.configure({ replyPatch: { [field]: field === 'manifestHash' ? `sha256:${'f'.repeat(64)}` : crypto.randomUUID() } });
      await c.pulse(); const pulse = await c.wait(c.begin('pulse')), action = await c.draft();
      return { pulse, save: await c.wait(c.begin('save', action)), retained: await c.retained(action), state: await c.state() };
    }, field);
    expect(result.pulse.status).toBe('rejected'); expect(result.save.status).toBe('rejected'); expect(result.retained).toBeNull();
    expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  });
}

for (const field of ['run', 'provider', 'usage', 'event', 'action'] as const) {
  test(`post-wake HTTP ${field} mismatch does not become a successor claim`, async ({ page }) => {
    const result = await page.evaluate(async field => {
      const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
      await c.pulse(); c.hold('wake:after'); const job = c.begin('pulse'); await c.entered('wake:after');
      c.corruptRemote(field); c.release('wake:after'); const pulse = await c.wait(job);
      return { pulse, state: await c.state(), remote: c.remote(), calls: c.hostCalls() };
    }, field);
    expect(result.pulse.status).toBe('rejected'); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
    expect(result.remote.activations).toBe(1); expect(result.calls.some(c => c.operation === 'agentica.action.reserve')).toBe(false);
  });
}

test('changed world after claim refuses the grant but not evidence-only handoff ACK', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.changeWorld(); const before = await c.dump();
    const pulse = await c.wait(c.begin('pulse')), unchanged = before === await c.dump();
    const ack = await c.acknowledge(); return { pulse, unchanged, ack, state: await c.state() };
  });
  expect(result.pulse.status).toBe('rejected'); expect(result.unchanged).toBe(true); expect(result.state.grant).toBeNull();
  expect(result.state.operation.state).toBe('acknowledged');
});

test('stale GameSession lifetime aborts a queued fresh action without reserving it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    const action = await c.draft(), save = c.begin('save', action), before = await c.dump(); c.endLifetime();
    return { save: await c.wait(save), unchanged: before === await c.dump(), calls: c.calls(), retained: await c.retained(action) };
  });
  expect(result.save.status).toBe('rejected'); expect(result.retained).toBeNull(); expect(result.unchanged).toBe(true);
  expect(result.calls.filter(c => c.method !== 'close')).toEqual([]);
});

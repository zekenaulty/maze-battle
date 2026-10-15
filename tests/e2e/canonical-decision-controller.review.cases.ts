import { test, expect } from './canonical-decision-controller.test';

for (const stop of ['cancel', 'disconnect'] as const) {
  test(`${stop} during final native pre-wake read cannot dispatch or reconnect`, async ({ page }) => {
    const result = await page.evaluate(async stop => {
      const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
      await c.pulse(); c.hold('list:after'); const job = c.begin('pulse'); await c.entered('list:after');
      c.holdPrewakeRead(); c.release('list:after'); await c.entered('prewake-read:after');
      const held = c.job(job), before = await c.state();
      const stopped = stop === 'cancel' ? await c.wait(c.begin('cancel')) : c.disconnect();
      c.release('prewake-read:after'); const pulse = await c.wait(job);
      return { held, before, stopped, pulse, state: await c.state(), calls: c.calls(), remote: c.remote() };
    }, stop);
    expect(result.held.status).toBe('pending'); expect(result.remote.activations).toBe(0);
    expect(result.calls.filter(c => c.method === 'wake' || c.method === 'adopt')).toEqual([]);
    expect(result.calls.filter(c => c.method === 'connect')).toHaveLength(1);
    expect(result.state.intent).toEqual(result.before.intent); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
    if (stop === 'cancel') {
      expect(result.stopped).toMatchObject({ status: 'fulfilled', value: { status: 'locally-stopped' } });
      expect(result.state.launch.guard.terminal?.disposition).toBe('cancelled'); expect(result.pulse.status).toBe('rejected');
    } else {
      expect(result.pulse).toMatchObject({ status: 'fulfilled', value: { status: 'recovery-required' } });
      expect(result.state.launch.guard.state).toBe('admitted');
    }
  });
}

test('attached pulse retains its frozen binding after a real successor navigation step', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); const attached = await c.pulse(), before = await c.state();
    const moved = await c.moveSuccessor(await c.draft()), afterMove = await c.state(), bytes = await c.dump(), calls = c.calls();
    const pulse = await c.pulse();
    return { attached, before, moved, afterMove, pulse, unchanged: bytes === await c.dump(), calls, finalCalls: c.calls(), control: c.control() };
  });
  expect(result.moved.progress).toMatchObject({ status: 'running', steps: 1 });
  expect(result.afterMove.head.checkpoint).not.toEqual(result.before.head.checkpoint);
  expect(result.afterMove.head.revision).toBeGreaterThan(result.before.head.revision);
  expect(result.pulse).toEqual(result.attached); expect(result.control.phase).toBe('attached');
  expect(result.unchanged).toBe(true); expect(result.finalCalls).toEqual(result.calls);
});

test('failed pulse releases attachment for a replacement while keeping the old controller ACK usable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); const original = await c.state(), entry = c.remote().entry;
    c.corruptRemote('usage'); const failed = await c.wait(c.begin('pulse'));
    const replacement = await c.create(); c.replaceRemoteEntry(entry); const ack = await c.acknowledgePrevious();
    const connected = await c.pulse(), attached = await c.pulse();
    return { failed, replacement, ack, connected, attached, original, state: await c.state(), remote: c.remote() };
  });
  expect(result.failed.status).toBe('rejected'); expect(result.replacement.binding).toBeNull();
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.state.operation.state).toBe('acknowledged');
  expect(result.connected.status).toBe('connected'); expect(result.attached.status).toBe('attached');
  expect(result.state.intent).toEqual(result.original.intent); expect(result.state.claim).toEqual(result.original.claim);
  expect(result.remote.activations).toBe(1);
});

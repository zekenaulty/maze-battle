import { test, expect } from './canonical-decision-controller.test';

test('lost wake reply reattaches with the original retained identity, never a replacement activation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); c.configure({ loseWakeReply: true });
    await c.create(); await c.prepare(await c.publish()); await c.pulse(); const original = (await c.state()).intent;
    const lost = await c.wait(c.begin('pulse')), afterLost = await c.state(); c.close();
    await c.create(); await c.pulse(); const claimed = await c.pulse(), attached = await c.pulse();
    return { lost, original, afterLost, claimed, attached, state: await c.state(), calls: c.calls(), remote: c.remote() };
  });
  expect(result.lost).toMatchObject({ status: 'rejected', error: expect.stringContaining('lost committed wake reply') });
  expect(result.afterLost.claim).toBeNull(); expect(result.afterLost.grant).toBeNull();
  expect(result.claimed.status).toBe('claimed'); expect(result.attached.status).toBe('attached');
  expect(result.state.intent).toEqual(result.original); expect(result.remote.activations).toBe(1);
  const wakes = result.calls.filter(c => c.method === 'wake'); expect(wakes).toHaveLength(2);
  expect(wakes[1].input).toEqual(wakes[0].input);
});

test('retained pending action after controller restart is unresolved, never executed as fresh', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.pulse(); const action = await c.draft();
    const saved = await c.wait(c.begin('save', action)), pending = await c.retained(action), before = await c.dump(); c.close();
    await c.create(); await c.pulse(); const attached = await c.pulse();
    const resaved = await c.wait(c.begin('save', action)), replay = await c.wait(c.begin('action', action));
    return { saved, pending, attached, resaved, replay, unchanged: before === await c.dump(), remote: c.remote() };
  });
  expect(result.saved.status).toBe('fulfilled'); expect(result.pending!.result).toBeNull();
  expect(result.attached.status).toBe('attached'); expect(result.resaved.status).toBe('fulfilled');
  expect(result.replay).toMatchObject({ status: 'fulfilled', value: { disposition: 'unresolved' } });
  expect(result.unchanged).toBe(true); expect(result.remote.activations).toBe(1);
});

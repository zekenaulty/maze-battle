import { test, expect } from './canonical-decision-controller.test';

test('native grant commit failure leaves both grant and selection unchanged and rejects queued fresh saves', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); const before = await c.dump(), state = await c.state(), action = await c.draft();
    const save = c.begin('save', action); c.failNext('grant'); const pulse = await c.wait(c.begin('pulse'));
    return { pulse, save: await c.wait(save), unchanged: before === await c.dump(), before: state, after: await c.state(), retained: await c.retained(action) };
  });
  expect(result.pulse.status).toBe('rejected'); expect(result.save.status).toBe('rejected'); expect(result.retained).toBeNull();
  expect(result.unchanged).toBe(true); expect(result.after.grant).toBeNull(); expect(result.after.selection).toEqual(result.before.selection);
});

test('funded handoff ACK at ordinary quota retains the exact request and remote entry across a native write failure', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.fillQuota(); const before = await c.dump();
    c.failNext('cleanup'); const failed = await c.wait(c.begin('ack')), unchanged = before === await c.dump(), calls = c.calls();
    c.configure({ unavailable: true }); const retried = await c.acknowledge();
    return { failed, unchanged, calls, retried, finalCalls: c.calls(), hostCalls: c.hostCalls(), state: await c.state() };
  });
  expect(result.failed.status).toBe('rejected'); expect(result.unchanged).toBe(true);
  expect(result.finalCalls).toEqual(result.calls); expect(result.retried.status).toBe('navigation-acknowledged');
  const cleanups = result.hostCalls.filter(c => c.operation.startsWith('cleanup.')); expect(cleanups).toHaveLength(2);
  expect(cleanups[0].operation).toBe('cleanup.verified-ack'); expect(cleanups[0].failedRequest).toBeTruthy();
  expect(cleanups[1]).toMatchObject({ operation: 'cleanup.verified-retry', input: { request: cleanups[0].failedRequest } });
  expect(result.state.operation.state).toBe('acknowledged'); expect(result.state.grant).toBeNull();
});

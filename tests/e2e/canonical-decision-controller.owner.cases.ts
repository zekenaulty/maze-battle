import { test, expect } from './canonical-decision-controller.test';

test('reload reads the retained intent without authority; a new owner cannot silently reuse its old intention', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    const snapshot = c.snapshot(), state = await c.state(); c.close(); c.endLifetime();
    return { snapshot, intent: JSON.stringify(state.intent), owner: state.head.owner, epoch: state.head.epoch, bytes: await c.dump() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionController);
  const result = await page.evaluate(async saved => {
    const c = window.canonicalDecisionController; c.restore(saved.snapshot); await c.create();
    const unchanged = saved.bytes === await c.dump(), historical = await c.state(), readCalls = c.calls();
    await c.startSession(); await c.create(); const pulse = await c.wait(c.begin('pulse'));
    return { unchanged, historical, readCalls, pulse, state: await c.state(), calls: c.calls() };
  }, saved);
  expect(result.unchanged).toBe(true); expect(JSON.stringify(result.historical.intent)).toBe(saved.intent); expect(result.readCalls).toEqual([]);
  expect(result.state.head.owner).not.toBe(saved.owner); expect(result.state.head.epoch).toBeGreaterThan(saved.epoch);
  expect(result.pulse).toMatchObject({ status: 'rejected', error: expect.stringContaining('current-owner intention') });
  expect(JSON.stringify(result.state.intent)).toBe(saved.intent); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  expect(result.calls.filter(c => c.method !== 'close')).toEqual([]);
});

test('explicit new-owner intention adopts the guard only after claim, before atomically selecting the successor', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); const snapshot = c.snapshot(); c.endLifetime(); return snapshot;
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionController);
  const result = await page.evaluate(async saved => {
    const c = window.canonicalDecisionController; c.restore(saved); await c.startSession(); await c.create();
    await c.prepare(await c.publish()); const prepared = await c.state(), connected = await c.pulse(), claimed = await c.pulse();
    const beforeAdoption = await c.state(), adopted = await c.pulse(), afterAdoption = await c.state(), attached = await c.pulse();
    return { prepared, connected, claimed, beforeAdoption, adopted, afterAdoption, attached, final: await c.state(), calls: c.calls() };
  }, saved);
  expect(result.prepared.intent!.data.adoption).toMatchObject({ nextSessionEpoch: String(result.prepared.head.epoch) });
  expect(result.prepared.intent!.data.event).toEqual(result.prepared.terminal);
  expect(result.connected.status).toBe('connected'); expect(result.claimed.status).toBe('claimed');
  expect(result.beforeAdoption.launch.guard.epoch).toBeLessThan(result.beforeAdoption.head.epoch);
  expect(result.beforeAdoption.grant).toBeNull(); expect(result.adopted.status).toBe('guard-adopted');
  expect(result.afterAdoption.launch.guard.epoch).toBe(result.afterAdoption.head.epoch); expect(result.afterAdoption.grant).toBeNull();
  expect(result.attached.status).toBe('attached');
  expect(result.final.selection!.value.data.grant).toEqual(result.final.grant!.record.ref);
  expect(result.calls.find(c => c.method === 'adopt')!.input).toEqual({ event: result.prepared.intent!.data.event,
    adoption: result.prepared.intent!.data.adoption });
  expect(result.calls.some(c => c.method === 'wake')).toBe(false);
});

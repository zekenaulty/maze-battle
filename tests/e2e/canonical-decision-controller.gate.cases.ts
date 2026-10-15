import { test, expect } from './canonical-decision-controller.test';

test('started does not release fresh SDK saves or actions before the atomic grant and selection', async ({ page }) => {
  const jobs = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); c.hold('wake:after'); const pulse = c.begin('pulse'); await c.entered('wake:after');
    const action = await c.draft(), other = { ...action, actionId: crypto.randomUUID() };
    return { pulse, action, other, save: c.begin('save', action), actionJob: c.begin('action', other) };
  });
  const beforeClaim = await page.evaluate(async ({ action, save, actionJob }) => {
    const c = window.canonicalDecisionController;
    return { state: await c.state(), save: c.job(save), action: c.job(actionJob), retained: await c.retained(action), calls: c.hostCalls() };
  }, jobs);
  expect(beforeClaim.save.status).toBe('pending'); expect(beforeClaim.action.status).toBe('pending');
  expect(beforeClaim.retained).toBeNull(); expect(beforeClaim.state.claim).toBeNull(); expect(beforeClaim.state.grant).toBeNull();
  expect(beforeClaim.calls.some(c => c.operation === 'agentica.action.reserve')).toBe(false);
  const grantJob = await page.evaluate(async jobs => {
    const c = window.canonicalDecisionController; c.release('wake:after'); await c.wait(jobs.pulse);
    c.hold('grant:before'); const grant = c.begin('pulse'); await c.entered('grant:before'); return grant;
  }, jobs);
  const beforeGrant = await page.evaluate(async jobs => {
    const c = window.canonicalDecisionController;
    return { state: await c.state(), save: c.job(jobs.save), action: c.job(jobs.actionJob), retained: await c.retained(jobs.action) };
  }, jobs);
  expect(beforeGrant.state.claim).not.toBeNull(); expect(beforeGrant.state.grant).toBeNull();
  expect(beforeGrant.save.status).toBe('pending'); expect(beforeGrant.action.status).toBe('pending'); expect(beforeGrant.retained).toBeNull();
  const after = await page.evaluate(async ({ jobs, grantJob }) => {
    const c = window.canonicalDecisionController; c.release('grant:before'); const attached = await c.wait(grantJob);
    const save = await c.wait(jobs.save), unused = await c.wait(jobs.actionJob), admitted = await c.wait(c.begin('action', jobs.action));
    return { attached, save, unused, admitted, state: await c.state(), retained: await c.retained(jobs.action), binding: c.control().binding };
  }, { jobs, grantJob });
  expect(after.attached).toMatchObject({ status: 'fulfilled', value: { status: 'attached' } });
  expect(after.save.status).toBe('fulfilled'); expect(after.unused).toMatchObject({ status: 'fulfilled', value: { disposition: 'unresolved' } });
  expect(after.admitted).toMatchObject({ status: 'fulfilled', value: { disposition: 'applied', operation: { operationId: expect.any(String) } } });
  expect(after.retained!.original.publication).toEqual(after.binding!.publication);
  expect(after.state.selection!.value.sourceAttemptId).toBe(after.state.grant!.record.value.sourceAttemptId);
  expect(after.state.selection!.row.revision).toBe(after.state.grant!.record.row.revision);
  expect(after.state.selection!.value.data).toMatchObject({ ...after.binding! });
});

test('canonical completed save replay is readable before grant, but fabricated completion is refused', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, seed = await c.boot(); await c.create();
    const before = await c.dump(), original = await c.replay(); let error = '';
    try { await c.replay(true); } catch (cause) { error = String(cause); }
    return { seed, original, error, unchanged: before === await c.dump(), calls: c.calls(), hostCalls: c.hostCalls(), state: await c.state() };
  });
  expect(result.original).toEqual(result.seed.entry.admission); expect(result.error).toBeTruthy(); expect(result.unchanged).toBe(true);
  expect(result.calls).toEqual([]); expect(result.hostCalls).toEqual([]); expect(result.state.grant).toBeNull();
});

import { expect, test } from './canonical-launch.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('funded admission, dispatch and announcement need a separate explicit initial grant', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const c = window.canonicalLaunch, binding = await c.seed(), admission = await c.admit(binding);
    const prepared = (await c.readLaunch()).value!; await c.transition('dispatch'); await c.announce();
    const before = await c.dump(), denied = await c.gate().catch(String), after = await c.dump();
    await c.grant(); const allowed = await c.gate(), state = (await c.readLaunch()).value!;
    return { binding, admission, prepared, denied, before, after, allowed, state };
  });
  expect(first.prepared.guard.state).toBe('admitted'); expect(first.prepared.state.value.data).toEqual({ dispatch: null, run: null, grant: null });
  expect(String(first.denied)).toContain('missing referenced launch record'); expect(first.after).toEqual(first.before);
  expect(first.allowed.receipt.result).toBe(true); expect(first.state.binding).toEqual(first.binding);
  expect(first.state.guard.terminalBytes).toBe(128 * 1024);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalLaunch);
  const recovered = await page.evaluate(() => window.canonicalLaunch.readLaunch());
  expect(recovered.value).toEqual(first.state);
});

test('all exact lifecycle receipts replay after takeover, cancellation and acknowledgement without effects', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch, binding = await c.seed(), stages = [await c.admit(binding), await c.transition('dispatch'), await c.announce(), await c.grant()];
    await c.takeover(); const stopped = await c.stop(); await c.ack(stopped.request.attemptId);
    const before = await c.dump(), replayed = [];
    for (const stage of stages) replayed.push(await c.executeLaunchCommand(stage.request));
    return { stages, replayed, before, after: await c.dump() };
  });
  expect(r.after).toEqual(r.before);
  for (let i = 0; i < r.stages.length; i++) { expect(r.replayed[i].replayed).toBe(true); expect(r.replayed[i].receipt).toEqual(r.stages[i].outcome.receipt); expect(r.replayed[i].stats.writes).toBe(0); }
});

test('ambiguous dispatch blocks retries and replacements even after local cancel/ACK, until original announcement reconciles', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); const dispatch = await c.transition('dispatch');
    const before = await c.dump(), retry = await c.transition('dispatch').catch(String), unchanged = await c.dump();
    const exact = await c.executeLaunchCommand(dispatch.request), stopped = await c.stop(); await c.ack(stopped.request.attemptId);
    const next = await c.binding('next'), preAdmission = await c.dump(), blocked = await c.admit(next).catch(String), postAdmission = await c.dump();
    await c.announce(); await c.admit(next);
    return { before, unchanged, retry, exact, preAdmission, postAdmission, blocked, active: (await c.readLaunch()).value, original: (await c.readLaunch('launch')).value };
  });
  expect(String(r.retry)).toContain('already dispatched'); expect(r.unchanged).toEqual(r.before); expect(r.exact.replayed).toBe(true);
  expect(String(r.blocked)).toContain('ambiguous start'); expect(r.postAdmission).toEqual(r.preAdmission);
  expect(r.active!.binding.launchId).toBe('next'); expect(r.original!.guard.state).toBe('acknowledged'); expect(r.original!.grant).toBeNull();
});

test('one funded launch excludes a replacement; an undispatched cancelled and acknowledged launch can be replaced', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); const next = await c.binding('next');
    const before = await c.dump(), blocked = await c.admit(next).catch(String), after = await c.dump();
    const stopped = await c.stop(); await c.ack(stopped.request.attemptId); await c.admit(next);
    return { before, after, blocked, head: (await c.readCanonicalHead()).head, active: (await c.readLaunch()).value };
  });
  expect(String(r.blocked)).toContain('still funded'); expect(r.after).toEqual(r.before); expect(r.head.quota.reservations).toBe(1);
  expect(Object.keys(r.head.allocations)).toEqual(['agentica-launch:next']); expect(r.active!.binding.launchId).toBe('next');
});

test('takeover and generic guard adoption do not adopt the wire run or renew its grant', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); await c.takeover(); const before = await c.dump(), revoked = await c.gate().catch(String), after = await c.dump();
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: c.launchGuardId('launch') }), 'adopt');
    await c.announce(); const adopted = await c.gate().catch(String), grant = await c.grant().catch(String);
    return { before, after, revoked, adopted, grant };
  });
  expect(r.after).toEqual(r.before); expect(String(r.revoked)).toContain('custody'); expect(String(r.adopted)).toContain('custody');
  expect(String(r.grant)).toContain('explicit protocol adoption');
});

test('reload of dispatched launch is read-only and cannot issue a replacement start', async ({ page }) => {
  const request = await page.evaluate(async () => { const c = window.canonicalLaunch; await c.admit(await c.seed()); return (await c.transition('dispatch')).request; });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalLaunch);
  const r = await page.evaluate(async serialized => {
    const request = JSON.parse(serialized) as CanonicalRequest;
    const c = window.canonicalLaunch, before = await c.dump(), retained = await c.readLaunch(), replay = await c.executeLaunchCommand(request as CanonicalRequest);
    return { before, after: await c.dump(), retained, replay };
  }, JSON.stringify(request));
  expect(r.retained.value!.dispatch).not.toBeNull(); expect(r.retained.value!.run).toBeNull(); expect(r.replay.replayed).toBe(true); expect(r.after).toEqual(r.before);
});

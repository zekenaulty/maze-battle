import { expect, test } from './canonical-launch.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('a replacement launch cannot accept a late original run announcement', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const original = (await c.readLaunch()).value!, stopped = await c.stop(); await c.ack(stopped.request.attemptId);
    await c.admit(await c.binding('next')); await c.transition('dispatch', 'next'); const next = (await c.readLaunch()).value!;
    const before = await c.dump(), error = await c.transition('announce', 'next', { dispatch: { ...next.dispatch!.ref },
      ...c.launchProofFixture(original.binding.start, original.dispatch!.source.attemptId) }).catch(String);
    return { before, after: await c.dump(), error, originalSession: original.binding.start.sessionId, nextSession: next.binding.start.sessionId };
  });
  expect(r.nextSession).not.toBe(r.originalSession); expect(String(r.error)).toContain('announcement binding'); expect(r.after).toEqual(r.before);
});

test('duplicate announcements preserve exact metadata; changed payload or attempt identity is rejected', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch'); const current = (await c.readLaunch()).value!;
    const base = c.launchProofFixture(current.binding.start, current.dispatch!.source.attemptId);
    const proof = { ...base, started: { ...base.started, serviceMetadata: { retained: 'original' } } };
    const announced = await c.transition('announce', 'launch', { dispatch: { ...current.dispatch!.ref }, ...proof });
    const duplicate = await c.transition('announce', 'launch', { dispatch: { ...current.dispatch!.ref }, ...proof });
    const before = await c.dump(), changed = await c.transition('announce', 'launch', { dispatch: { ...current.dispatch!.ref },
      ...proof, admission: { ...proof.admission, acceptedRequestHash: `sha256:${'d'.repeat(64)}` } }).catch(String);
    const collision = structuredClone(announced.request); ((collision.input as JsonObject).started as JsonObject).runId = 'other';
    const reused = await c.executeLaunchCommand(collision).catch(String);
    return { before, after: await c.dump(), changed, reused, duplicate, retained: (await c.readLaunch()).value! };
  });
  expect(String(r.changed)).toMatch(/^Error:/); expect(String(r.reused)).toContain('original receipt'); expect(r.after).toEqual(r.before);
  expect(r.retained.run!.value.data.admission.acceptedRequestHash).toBe(`sha256:${'c'.repeat(64)}`);
  expect(r.retained.run!.value.data.started.serviceMetadata).toEqual({ retained: 'original' });
});

test('corrupt protocol evidence cannot prevent funded Stop but cannot authorize verified ACK', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const current = await c.readLaunch();
    const historical = await c.readCanonical(p => c.loadLaunch(p, 'launch'), { snapshot: current.snapshot }).catch(String);
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.corrupt'), async tx => { await tx.pages.delete('execution', 'agentica/launches/launch/state'); return true; });
    const before = await c.dump(), corrupt = await c.readLaunch().catch(String), after = await c.dump();
    const stop = await c.stop(), stopped = await c.dump(), ack = await c.ack(stop.request.attemptId, null).catch(String);
    return { historical, corrupt, before, after, ack, stopped, final: await c.dump(), head: (await c.readCanonicalHead()).head };
  });
  expect(String(r.historical)).toContain('historical snapshot'); expect(String(r.corrupt)).toContain('missing launch state'); expect(r.after).toEqual(r.before);
  expect(String(r.ack)).toMatch(/^Error:/); expect(r.final).toEqual(r.stopped); expect(r.head.quota.reservations).toBe(1);
});

test('a proven absence of dispatch is required before a stopped launch can be replaced', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch'); const stopped = await c.stop(); await c.ack(stopped.request.attemptId);
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.missing'), async tx => {
      await tx.pages.delete('execution', 'agentica/launches/launch/dispatch'); return true;
    });
    const next = await c.binding('next'), before = await c.dump(), error = await c.admit(next).catch(String);
    return { before, after: await c.dump(), error };
  });
  expect(String(r.error)).toContain('missing referenced'); expect(r.after).toEqual(r.before);
});

test('a first announcement recovered after takeover binds the old run without acquiring its grant', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch'); await c.takeover(); await c.announce();
    const current = (await c.readLaunch()).value!, before = await c.dump(), denied = await c.grant().catch(String);
    return { current, denied, before, after: await c.dump() };
  });
  expect(r.current.run!.value.data.started.sessionEpoch).toBe('1'); expect(r.current.run!.source.expected.epoch).toBeGreaterThan(1);
  expect(r.current.grant).toBeNull(); expect(String(r.denied)).toContain('explicit protocol adoption'); expect(r.after).toEqual(r.before);
});

test('competing exact admissions on the same fence fund only one launch', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch, first = await c.seed(), head = (await c.readCanonicalHead()).head, second = structuredClone(first);
    second.launchId = 'second'; (second.start as JsonObject).sessionId = c.launchSessionId(head.gameId, 'second');
    const requests = [first, second].map(binding => c.command(head, 'operation.admit', { operationId: c.launchGuardId(binding.launchId as string), binding, terminalBytes: 128 * 1024, ackPolicy: 'verified-host' }));
    const results = await Promise.allSettled(requests.map(request => c.executeLaunchCommand(request)));
    return { status: results.map(r => r.status), current: await c.readLaunch() };
  });
  expect(r.status.filter(s => s === 'fulfilled')).toHaveLength(1); expect(r.current.head.quota.reservations).toBe(1);
  expect(Object.keys(r.current.head.allocations)).toEqual([r.current.value!.guard.id]);
});

test('a cancelled live guard rejects further effects without needing an ordinary revoked-grant write', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const original = (await c.readLaunch()).value!.grant;
    await c.stop(); const before = await c.dump(), error = await c.gate().catch(String), current = (await c.readLaunch()).value!;
    return { original, current, error, before, after: await c.dump() };
  });
  expect(String(r.error)).toContain('guard changed'); expect(r.after).toEqual(r.before); expect(r.current.grant).toEqual(r.original);
});

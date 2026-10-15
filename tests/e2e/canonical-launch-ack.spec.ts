import { test, expect } from './canonical-launch.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const state of ['undispatched', 'dispatched', 'announced'] as const)
  test(`null service proof ${state === 'undispatched' ? 'releases' : 'cannot release'} ${state} launch`, async ({ page }) => {
    const r = await page.evaluate(async state => {
      const c = window.canonicalLaunch; await c.admit(await c.seed());
      if (state !== 'undispatched') await c.transition('dispatch');
      if (state === 'announced') await c.announce();
      const stop = await c.stop(), before = await c.dump(), ack = await c.ack(stop.request.attemptId, null).catch(String);
      return { ack, before, after: await c.dump(), launch: (await c.readLaunch()).value! };
    }, state);
    if (state === 'undispatched') expect(r.launch.guard.state).toBe('acknowledged');
    else { expect(String(r.ack)).toMatch(/^Error:/); expect(r.after).toEqual(r.before); expect(r.launch.guard.state).toBe('settled'); }
  });

for (const reason of ['stopped', 'interrupted'] as const) test(`${reason} terminal proof is frozen before awaiting and ACK replays without new writes`, async ({ page }) => {
  const r = await page.evaluate(async reason => {
    const c = window.canonicalLaunch; await c.ready(); await c.stop();
    const current = (await c.readLaunch()).value!;
    const raw = c.launchTerminalFixture(c.launchEntryFixture(current.binding.start, current.dispatch!.source.attemptId), reason);
    const verification = c.launchAcknowledgement('launch', raw), preparing = verification.prepare();
    raw.runId = 'changed'; raw.acceptedRequest.objective = 'Changed authority'; raw.terminal!.usageUnknown = !raw.terminal!.usageUnknown;
    const prepared = await preparing, request = c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: prepared.target.operationId, terminalAttemptId: prepared.terminalAttemptId, proof: prepared.proof });
    const commit = await c.acknowledgeCanonical(request, verification.verify), before = await c.dump();
    const replay = await c.replayAcknowledgement(request);
    return { commit, replay, before, after: await c.dump(), proof: prepared.proof, launch: (await c.readLaunch()).value! };
  }, reason);
  expect(r.launch.guard.state).toBe('acknowledged'); expect(r.after).toEqual(r.before);
  expect(r.replay.replayed).toBe(true); expect(r.replay.receipt).toEqual(r.commit.receipt); expect(r.replay.stats.writes).toBe(0);
  expect(r.proof.admission).not.toHaveProperty('originalRequest'); expect(r.proof.admission).not.toHaveProperty('acceptedRequest');
  expect(r.proof.terminal).toMatchObject({ reason, usageUnknown: reason === 'interrupted' });
});

for (const reason of ['stopped', 'interrupted'] as const)
  test(`${reason} remote ACK without a run record rejects late announcement without writes`, async ({ page }) => {
    const r = await page.evaluate(async reason => {
      const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch');
      const dispatched = (await c.readLaunch()).value!, stopped = await c.stop();
      const raw = c.launchTerminalFixture(c.launchEntryFixture(dispatched.binding.start, dispatched.dispatch!.source.attemptId), reason);
      await c.ack(stopped.request.attemptId, raw);
      const settled = (await c.readLaunch()).value!, head = (await c.readCanonicalHead()).head, before = await c.dump();
      const error = await c.announce().then(() => 'accepted', String);
      return { settled, head, error, before, after: await c.dump() };
    }, reason);
    expect(r.settled.guard.state).toBe('acknowledged'); expect(r.settled.run).toBeNull(); expect(r.settled.grant).toBeNull();
    expect(r.head.quota.reservations).toBe(0); expect(r.head.quota.reservedBytes).toBe(0);
    expect(r.error).toContain('settled launch cannot acquire a late run record'); expect(r.after).toEqual(r.before);
    await page.reload(); await page.waitForFunction(() => !!window.canonicalLaunch);
    expect((await page.evaluate(() => window.canonicalLaunch.readLaunch())).value).toEqual(r.settled);
  });

for (const defect of ['pending', 'stop', 'run', 'hash', 'usage', 'time'] as const)
  test(`${defect} service evidence cannot ACK an announced launch`, async ({ page }) => {
    const r = await page.evaluate(async defect => {
      const c = window.canonicalLaunch; await c.ready(); const stopped = await c.stop(), raw = (await c.terminalEntry())!;
      if (defect === 'pending') raw.terminal = null;
      if (defect === 'stop') raw.stopRequested = false;
      if (defect === 'run') raw.runId = 'another-run';
      if (defect === 'hash') Reflect.set(raw, 'acceptedRequestHash', `sha256:${'e'.repeat(64)}`);
      if (defect === 'usage') raw.terminal!.usageUnknown = true;
      if (defect === 'time') raw.terminal!.settledAt = '2026-10-15T11:59:59.9999999+00:00';
      const before = await c.dump(), error = await c.ack(stopped.request.attemptId, raw).catch(String);
      return { before, after: await c.dump(), error, launch: (await c.readLaunch()).value! };
    }, defect);
    expect(String(r.error)).toMatch(/^Error:/); expect(r.after).toEqual(r.before); expect(r.launch.guard.state).toBe('settled');
  });

test('generic local ACK and changed prepared proof cannot bypass verified service settlement', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const stopped = await c.stop();
    const request = c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: c.launchGuardId('launch'), terminalAttemptId: stopped.request.attemptId });
    const before = await c.dump(), generic = await c.operateCanonical(request, 'acknowledge').catch(String);
    const verification = c.launchAcknowledgement('launch', await c.terminalEntry()), prepared = await verification.prepare();
    const proof = structuredClone(prepared.proof); (proof.admission as JsonObject).acceptedRequestHash = `sha256:${'e'.repeat(64)}`;
    const changed = await c.acknowledgeCanonical({ ...request, input: { ...(request.input as JsonObject), proof } }, verification.verify).catch(String);
    return { before, after: await c.dump(), generic, changed };
  });
  expect(String(r.generic)).toMatch(/^Error:/); expect(String(r.changed)).toMatch(/^Error:/); expect(r.after).toEqual(r.before);
});

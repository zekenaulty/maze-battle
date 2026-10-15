import { test, expect, ready, state } from './canonical-granted-recovery.setup';
import type { LaunchEntryFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

for (const field of ['run', 'attempt', 'originalHash', 'acceptedHash', 'manifest', 'host', 'session', 'epoch',
  'scope', 'perspective', 'objective', 'provider', 'limits', 'observation', 'capabilities', 'acceptedAuthority']) {
  test(`wrong ${field} never reaches remote Stop/ACK; local Stop still works at quota`, async ({ page }) => {
    await ready(page);
    const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote()) as LaunchEntryFixture;
    if (field === 'run') remote.runId = 'successor-run';
    if (field === 'attempt') remote.attemptId = 'another-attempt';
    if (field === 'originalHash') remote.originalRequestHash = `sha256:${'d'.repeat(64)}`;
    if (field === 'acceptedHash') remote.acceptedRequestHash = `sha256:${'d'.repeat(64)}`;
    if (field === 'manifest') remote.manifestHash = `sha256:${'d'.repeat(64)}`;
    if (field === 'host') Object.assign(remote.originalRequest, { hostId: 'foreign-host' });
    if (field === 'session') remote.originalRequest.sessionId = 'foreign-session';
    if (field === 'epoch') remote.originalRequest.sessionEpoch = '999';
    if (field === 'scope') remote.originalRequest.scopeId = 'foreign-scope';
    if (field === 'perspective') Object.assign(remote.originalRequest, { perspectiveId: 'foreign-perspective' });
    if (field === 'objective') remote.originalRequest.objective = 'Different objective';
    if (field === 'provider') remote.originalRequest.provider.model = 'different-model';
    if (field === 'limits') remote.originalRequest.limits.maxSteps++;
    if (field === 'observation') remote.originalRequest.observation.revision++;
    if (field === 'capabilities') remote.originalRequest.capabilities.pop();
    if (field === 'acceptedAuthority') remote.acceptedRequest.observation.revision++;
    expect(await page.evaluate(() => window.canonicalGrantedRecovery.quota())).toMatch(/quota/i);
    await page.evaluate(remote => window.canonicalGrantedRecovery.setRemote(remote), remote);
    expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toMatch(/start|identity|manifest|announcement/i);
    const after = await state(page);
    expect(after.launch!.guard.terminal!.disposition).toBe('cancelled');
    expect(after.cleanups.map(c => c.kind)).toEqual(['cancel']);
    expect(after.requests.map(r => r.method)).toEqual(['GET']);
    expect(after.requests[0].localStopped).toBe(true);
    expect(after.head.quota.reservedBytes).toBeGreaterThan(0);
  });
}

test('a successor outcome is not an authoritative root Stop response', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.canonicalGrantedRecovery.setStopReply({ runId: 'successor-run', status: 'completed', usage: {} }));
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toBeTruthy();
  const after = await state(page);
  expect(after.cleanups.map(c => c.kind)).toEqual(['cancel']);
  expect(after.requests.map(r => r.method)).toEqual(['GET', 'POST']);
  expect(after.launch!.guard.state).not.toBe('acknowledged');
  expect(after.head.quota.reservedBytes).toBeGreaterThan(0);
});

test('inspection result is not mutable authority; acknowledged root is historically inspectable', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const c = window.canonicalGrantedRecovery, inspected = await c.inspect();
    if (inspected.status === 'identified') inspected.run.runId = 'caller-mutation';
    c.setStop('stopped');
  });
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).settled).toBe(true);
  const raw = await page.evaluate(() => window.canonicalGrantedRecovery.remote());
  await page.evaluate(async raw => {
    const c = window.canonicalGrantedRecovery; c.closeRecovery(); c.setRemote(raw); await c.attach();
  }, raw);
  const before = await page.evaluate(() => window.canonicalGrantedRecovery.dump());
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.inspect())).status).toBe('identified');
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('settled');
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.dump())).toBe(before);
  expect((await state(page)).requests.filter(r => r.method === 'POST')).toHaveLength(1);
});

test('already settled root lookup performs local Stop and verified ACK without another service POST', async ({ page }) => {
  await ready(page);
  const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote()) as LaunchEntryFixture;
  Object.assign(remote, { stopRequested: true, terminal: { reason: 'interrupted', usage: null, usageUnknown: true,
    settledAt: '2026-10-15T12:01:00.0000000+00:00' } });
  await page.evaluate(remote => window.canonicalGrantedRecovery.setRemote(remote), remote);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('settled');
  const after = await state(page);
  expect(after.requests.map(r => r.method)).toEqual(['GET']); expect(after.requests[0].localStopped).toBe(true);
  expect(after.cleanups.map(c => c.kind)).toEqual(['cancel', 'verified-ack']);
  expect(after.head.quota.reservedBytes).toBe(0);
});

test('a mismatched root cannot poison a later exact inspection in the same helper', async ({ page }) => {
  await ready(page);
  const original = await page.evaluate(() => window.canonicalGrantedRecovery.remote()) as LaunchEntryFixture;
  const dump = await page.evaluate(() => window.canonicalGrantedRecovery.dump());
  await page.evaluate(remote => window.canonicalGrantedRecovery.setRemote(remote), { ...original, runId: 'wrong-run' });
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.inspect().then(() => '', String))).toContain('retained admission');
  await page.evaluate(remote => window.canonicalGrantedRecovery.setRemote(remote), original);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.inspect())).status).toBe('identified');
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.dump())).toBe(dump);
});

test('Stop reply must retain the exact identity established by lookup', async ({ page }) => {
  await ready(page);
  const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote()) as LaunchEntryFixture;
  Object.assign(remote, { runId: 'successor-run', stopRequested: true, terminal: { reason: 'interrupted', usage: null, usageUnknown: true,
    settledAt: '2026-10-15T12:01:00.0000000+00:00' } });
  await page.evaluate(remote => window.canonicalGrantedRecovery.setStopReply(remote), remote);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toContain('retained admission');
  const after = await state(page);
  expect(after.cleanups.map(c => c.kind)).toEqual(['cancel']);
  expect(after.requests.map(r => r.method)).toEqual(['GET', 'POST']);
  expect(after.head.quota.reservedBytes).toBeGreaterThan(0);
});

test('previously settled service entry cannot regress or change its terminal during Stop', async ({ page }) => {
  await ready(page);
  const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote()) as LaunchEntryFixture;
  Object.assign(remote, { stopRequested: true, terminal: { reason: 'interrupted', usage: null, usageUnknown: true,
    settledAt: '2026-10-15T12:01:00.0000000+00:00' } });
  await page.evaluate(async remote => { const c = window.canonicalGrantedRecovery; c.setRemote(remote); await c.inspect(); }, remote);
  remote.terminal!.settledAt = '2026-10-15T12:02:00.0000000+00:00';
  await page.evaluate(remote => window.canonicalGrantedRecovery.setRemote(remote), remote);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toContain('settlement changed');
  expect((await state(page)).cleanups.map(c => c.kind)).toEqual(['cancel']);
});

for (const failed of ['cancel', 'verified-ack'] as const) test(`physical ${failed} failure replays the exact funded request`, async ({ page }) => {
  await ready(page);
  await page.evaluate(failed => { const c = window.canonicalGrantedRecovery; c.setStop('interrupted'); c.failCleanup(failed); }, failed);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toContain('cleanup did not confirm');
  const failedState = await state(page), original = failedState.cleanups.find(c => c.kind === failed)!.request!;
  expect(failedState.launch!.guard.state).not.toBe('acknowledged');
  if (failed === 'cancel') expect(failedState.requests).toEqual([]);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).settled).toBe(true);
  const after = await state(page), retry = after.cleanups.find(c => c.kind === (failed === 'cancel' ? 'retry' : 'verified-retry'))!;
  expect(retry.request).toEqual(original);
  expect(after.launch!.guard.state).toBe('acknowledged');
  expect(after.head.quota.reservedBytes).toBe(0);
});

test('lost committed ACK reply is recovered from authoritative local ACK history, without another release', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { const c = window.canonicalGrantedRecovery; c.setStop('stopped'); c.loseAckReply(); });
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toContain('cleanup did not confirm');
  const after = await state(page), dump = await page.evaluate(() => window.canonicalGrantedRecovery.dump());
  expect(after.launch!.guard.state).toBe('acknowledged');
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).settled).toBe(true);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.dump())).toBe(dump);
  expect((await state(page)).cleanups).toEqual(after.cleanups);
});

test('held lookup cannot cross a changed GameSession lifetime or overlap another recovery request', async ({ page }) => {
  await ready(page); await page.evaluate(() => window.canonicalGrantedRecovery.hold());
  const inspection = page.evaluate(() => window.canonicalGrantedRecovery.inspect().then(() => '', String));
  await expect.poll(() => page.evaluate(() => window.canonicalGrantedRecovery.held())).toBe(true);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toContain('already in flight');
  await page.evaluate(() => window.canonicalGrantedRecovery.replaceLifetime());
  await page.evaluate(() => window.canonicalGrantedRecovery.release());
  expect(await inspection).toMatch(/abort|lifetime|disconnected/i);
  expect((await state(page)).cleanups).toEqual([]);
  await page.evaluate(() => { window.canonicalGrantedRecovery.closeRecovery(); });
  await page.evaluate(() => window.canonicalGrantedRecovery.attach());
});

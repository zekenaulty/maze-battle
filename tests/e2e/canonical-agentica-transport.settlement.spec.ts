import { test, expect, loseStart, original, recover, reload } from './canonical-agentica-transport.recovery.test';
import { launchTerminalFixture, launchAdmissionFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

test('terminal exact GET settles through funded ACK without another remote Stop', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = launchTerminalFixture(original(server), 'interrupted'); server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toMatchObject({ status: 'settled', localStopped: true, settled: true });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.state).toBe('acknowledged');
  expect(server.gets).toHaveLength(1); expect(server.posts).toEqual([]); expect(server.starts).toHaveLength(1);
});

for (const reason of ['stopped', 'interrupted'] as const) test(`${reason} full terminal reply supports verified ACK at exhausted normal quota`, async ({ page, durableServer: server }) => {
  const boot = await loseStart(page, server); server.entry = original(server);
  server.stopReply = launchTerminalFixture(server.entry, reason); server.requireLocalStop = true;
  await page.evaluate(() => window.canonicalTransport.fillQuota());
  expect(await recover(page, 'stop')).toMatchObject({ localStopped: true, settled: true });
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!, head = await page.evaluate(() => window.canonicalTransport.head());
  expect(launch.guard).toMatchObject({ ackPolicy: 'verified-host', state: 'acknowledged', terminal: { disposition: 'cancelled' } });
  expect(launch.run).toBeNull(); expect(launch.grant).toBeNull(); expect(head.quota.reservations).toBe(0);
  expect(head.quota.reservedBytes).toBe(0); expect(head.checkpoint).toEqual(boot.head.checkpoint);
  expect(server.posts).toHaveLength(1); expect(server.starts).toHaveLength(1);
  await reload(page);
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard).toEqual(launch.guard);
});

test('pending Stop stays funded across reload until a later full terminal response', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toMatchObject({ settled: false });
  const before = (await page.evaluate(() => window.canonicalTransport.launch()))!.guard;
  await reload(page); server.stopReply = launchTerminalFixture(server.entry);
  expect(await recover(page, 'stop')).toMatchObject({ settled: true });
  const after = (await page.evaluate(() => window.canonicalTransport.launch()))!.guard;
  expect(after.terminal).toEqual(before.terminal); expect(after.state).toBe('acknowledged');
  expect(server.posts).toHaveLength(2); expect(server.posts[1]).toEqual(server.posts[0]); expect(server.starts).toHaveLength(1);
});

for (const defect of ['runId', 'accepted-hash', 'original', 'accepted', 'compact-only', 'stop', 'known-usage', 'unknown-usage', 'time'] as const)
  test(`${defect} terminal reply cannot release the original launch reserve`, async ({ page, durableServer: server }) => {
    await loseStart(page, server); server.entry = original(server); const terminal = launchTerminalFixture(server.entry);
    server.stopReply = terminal; server.requireLocalStop = true;
    if (defect === 'runId') terminal.runId = 'foreign';
    if (defect === 'accepted-hash') Reflect.set(terminal, 'acceptedRequestHash', `sha256:${'e'.repeat(64)}`);
    if (defect === 'original') terminal.originalRequest.objective = 'Changed original';
    if (defect === 'accepted') terminal.acceptedRequest.limits.maxSteps++;
    if (defect === 'compact-only') server.stopReply = { ...launchAdmissionFixture(terminal), stopRequested: true, terminal: terminal.terminal };
    if (defect === 'stop') terminal.stopRequested = false;
    if (defect === 'known-usage') terminal.terminal!.usage = null;
    if (defect === 'unknown-usage') terminal.terminal!.reason = 'interrupted';
    if (defect === 'time') terminal.terminal!.settledAt = '2026-10-15T11:59:59.9999999+00:00';
    expect(await recover(page, 'stop')).toHaveProperty('error');
    const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
    expect(launch.guard.state).toBe('settled'); expect(launch.guard.terminal?.disposition).toBe('cancelled');
    expect((await page.evaluate(() => window.canonicalTransport.head())).quota.reservations).toBe(1);
    expect(launch.run).toBeNull(); expect(launch.grant).toBeNull(); expect(server.starts).toHaveLength(1);
  });

test('Stop-requested with terminal null does not release the reservation', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server);
  server.stopReply = { ...server.entry, stopRequested: true, terminal: null };
  expect(await recover(page, 'stop')).toMatchObject({ settled: false });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.state).toBe('settled');
  expect(server.posts).toHaveLength(1);
});

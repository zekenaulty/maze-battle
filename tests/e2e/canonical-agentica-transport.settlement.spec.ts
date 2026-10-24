import { test, expect, loseStart, original, recover, reload } from './canonical-agentica-transport.recovery.test';
import { launchTerminalFixture, launchAdmissionFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

test('terminal exact GET settles through funded ACK without another remote Stop', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = launchTerminalFixture(original(server), 'interrupted'); server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toMatchObject({ status: 'settled', localStopped: true, settled: true });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.state).toBe('acknowledged');
  expect(server.gets).toHaveLength(1); expect(server.posts).toEqual([]); expect(server.starts).toHaveLength(1);
});

for (const reason of ['stopped', 'interrupted'] as const) test(`${reason} full terminal reply supports verified ACK at exhausted normal quota`, async ({ page, durableServer: server }, info) => {
  const boot = await loseStart(page, server); server.entry = original(server);
  server.stopReply = launchTerminalFixture(server.entry, reason); server.requireLocalStop = true;
  const full = await page.evaluate(() => window.canonicalTransport.fillQuota());
  const refused = await page.evaluate(() => window.canonicalTransport.quota.refuseOrdinary());
  await info.attach('quota-boundary.json', { body: JSON.stringify({ full, refused }), contentType: 'application/json' });
  expect(full.ordinaryRemaining).toBe(0); expect(full.actualStoredBytes).toBe(full.head.quota.usedBytes);
  expect(full.admissionBytes).toBeGreaterThan(full.head.quota.usedBytes);
  expect(full.head.quota.privateCapacity).toEqual(full.before.quota.privateCapacity);
  expect(full.head.quota.reserveBytes).toBe(full.before.quota.reserveBytes);
  expect(full.head.quota.reservedBytes).toBe(full.before.quota.reservedBytes);
  expect(full.head.allocations).toEqual(full.before.allocations);
  expect(refused).toMatchObject({ error: 'Error: Canonical storage: storage quota exhausted', called: true, unchanged: true });
  expect(refused.afterBytes).toBe(full.actualStoredBytes);
  expect(refused.native.operations.length).toBeGreaterThan(0);
  expect(refused.native.operations.every(op => op.method === 'get' && op.status === 'success')).toBe(true);
  expect(refused.native.transactions.some(tx => tx.mode === 'readwrite' && tx.outcome === 'abort')).toBe(true);
  await page.evaluate(() => window.canonicalTransport.quota.startProbe());
  try { expect(await recover(page, 'stop')).toMatchObject({ localStopped: true, settled: true }); }
  finally {
    const native = await page.evaluate(() => window.canonicalTransport.quota.finishProbe());
    await info.attach('funded-cleanup-native.json', { body: JSON.stringify(native), contentType: 'application/json' });
    expect(native.operations.every(op => op.status === 'success')).toBe(true);
    expect(native.transactions.every(tx => tx.outcome === 'complete')).toBe(true);
    const writes = native.operations.filter(op => ['add', 'put', 'delete', 'clear'].includes(op.method));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(op => ['heads', 'receipts', 'operations'].includes(op.store) && ['add', 'put'].includes(op.method))).toBe(true);
  }
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!, head = await page.evaluate(() => window.canonicalTransport.head());
  expect(launch.guard).toMatchObject({ ackPolicy: 'verified-host', state: 'acknowledged', terminal: { disposition: 'cancelled' } });
  expect(launch.run).toBeNull(); expect(launch.grant).toBeNull(); expect(head.quota.reservations).toBe(0);
  expect(head.quota.reservedBytes).toBe(0); expect(head.checkpoint).toEqual(boot.head.checkpoint);
  expect(server.posts).toHaveLength(1); expect(server.starts).toHaveLength(1);
  await reload(page);
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard).toEqual(launch.guard);
  const loaded = await page.evaluate(() => window.canonicalTransport.quota.audit());
  await info.attach('quota-after-reload.json', { body: JSON.stringify({ settled: head, loaded }), contentType: 'application/json' });
  expect(loaded.actualStoredBytes).toBe(loaded.head.quota.usedBytes);
  expect(loaded.head.quota.limitBytes).toBe(full.head.quota.limitBytes);
  expect(loaded.head.quota.privateCapacity).toEqual(full.head.quota.privateCapacity);
  expect(loaded.ordinaryRemaining).toBeGreaterThan(0);
  expect(loaded.head.owner).not.toBe(head.owner); expect(loaded.head.status).toBe('ready');
  expect(loaded.head.roots).toEqual(full.head.roots); expect(loaded.head.checkpoint).toEqual(boot.head.checkpoint);
  expect(loaded.head.quota.reservations).toBe(0); expect(loaded.head.quota.reservedBytes).toBe(0);
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

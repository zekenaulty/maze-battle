import { test, expect, loseStart, original, recover, reload, holdLookup } from './canonical-agentica-transport.recovery.test';

test('undispatched inspection is read-only and Stop uses verified null proof without network', async ({ page, durableServer: server }) => {
  await page.evaluate(() => window.canonicalTransport.boot());
  const before = await page.evaluate(() => window.canonicalTransport.head());
  expect(await recover(page, 'inspect')).toEqual({ status: 'undispatched' });
  expect(await page.evaluate(() => window.canonicalTransport.head())).toEqual(before);
  expect(await recover(page, 'stop')).toMatchObject({ status: 'settled', localStopped: true, settled: true });
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
  expect(launch.guard.state).toBe('acknowledged'); expect(launch.dispatch).toBeNull();
  expect(server.gets).toEqual([]); expect(server.posts).toEqual([]); expect(server.starts).toEqual([]);
});

test('exact-key not_found stays UNKNOWN after reload without mutation or another start', async ({ page, durableServer: server }) => {
  await loseStart(page, server); await reload(page);
  const before = await page.evaluate(() => window.canonicalTransport.head());
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'unknown' });
  expect(await page.evaluate(() => window.canonicalTransport.head())).toEqual(before);
  expect(server.gets).toHaveLength(1); expect(server.posts).toEqual([]); expect(server.starts).toHaveLength(1);
  await page.evaluate(() => window.canonicalTransport.closeRecovery());
  const error = await page.evaluate(() => window.canonicalTransport.attach().then(() => '', String));
  expect(error).toContain('requires reconciliation');
});

test('exact admission identifies the original but never announces or grants; unsettled Stop retains funding', async ({ page, durableServer: server }) => {
  const boot = await loseStart(page, server); server.entry = original(server);
  const head = await page.evaluate(() => window.canonicalTransport.head());
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'identified', settled: false, fullStartEquivalence: 'verified' });
  expect(await page.evaluate(() => window.canonicalTransport.head())).toEqual(head);
  server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toMatchObject({ status: 'stop-requested', localStopped: true, settled: false });
  expect(server.posts).toHaveLength(1);
  const launch = (await page.evaluate(() => window.canonicalTransport.launch()))!;
  expect(launch.guard).toMatchObject({ ackPolicy: 'verified-host', state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(launch.run).toBeNull(); expect(launch.grant).toBeNull();
  const after = await page.evaluate(() => window.canonicalTransport.head());
  expect(after.checkpoint).toEqual(boot.head.checkpoint); expect(after.quota.reservations).toBe(1);
  expect(server.starts).toHaveLength(1);
});

for (const defect of ['attempt', 'original-objective', 'accepted-objective', 'limits', 'provider', 'digest', 'array', 'oversized'] as const)
  test(`rejects ${defect} entry; explicit Stop still withdraws locally`, async ({ page, durableServer: server }) => {
    await loseStart(page, server); const row = original(server); server.entry = row;
    if (defect === 'attempt') row.attemptId = 'other-attempt';
    if (defect === 'original-objective') row.originalRequest.objective = 'Changed objective';
    if (defect === 'accepted-objective') row.acceptedRequest.objective = 'Changed objective';
    if (defect === 'limits') row.acceptedRequest.limits.maxSteps++;
    if (defect === 'provider') row.acceptedRequest.provider.maxOutputTokens++;
    if (defect === 'digest') Reflect.set(row, 'acceptedRequestHash', 'not-a-digest');
    if (defect === 'array') Reflect.set(server, 'entry', [row]);
    if (defect === 'oversized') row.originalRequest.objective = 'x'.repeat(262145);
    server.requireLocalStop = true;
    expect(await recover(page, 'stop')).toHaveProperty('error');
    expect(server.posts).toEqual([]); expect(server.starts).toHaveLength(1);
    expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  });

test('lost Stop reply and reload preserve the original local Stop without fabricating settlement', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); server.failStop = true; server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toHaveProperty('error');
  const terminal = (await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal;
  await reload(page); server.failStop = false;
  expect(await recover(page, 'stop')).toMatchObject({ localStopped: true, settled: false });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal).toEqual(terminal);
  expect(server.posts).toHaveLength(2); expect(server.posts[1]).toEqual(server.posts[0]); expect(server.starts).toHaveLength(1);
});

test('Stop remains durable when the exact service entry is absent', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.requireLocalStop = true;
  expect(await recover(page, 'stop')).toMatchObject({ status: 'unknown', localStopped: true });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  expect(server.posts).toEqual([]);
});

test('session replacement during lookup prevents remote Stop', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); const held = await holdLookup(page, server);
  const pending = recover(page, 'stop'); await expect.poll(held.entered).toBe(true);
  await page.evaluate(() => window.canonicalTransport.reloadSession()); held.release();
  expect(await pending).toHaveProperty('error'); expect(server.posts).toEqual([]);
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
});

test('overlapping recovery calls cannot dispatch duplicate Stops', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); const held = await holdLookup(page, server);
  const pending = recover(page, 'stop'); await expect.poll(held.entered).toBe(true);
  expect(await recover(page, 'stop')).toMatchObject({ error: expect.stringContaining('already in flight') });
  held.release(); expect(await pending).toMatchObject({ settled: false }); expect(server.posts).toHaveLength(1);
});

test('physical Stop write failure retries its original attempt before any network request', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); server.requireLocalStop = true;
  await page.evaluate(() => window.canonicalTransport.failCleanupOnce());
  expect(await recover(page, 'stop')).toHaveProperty('error'); expect(server.gets).toEqual([]); expect(server.posts).toEqual([]);
  const attempt = await page.evaluate(() => window.canonicalTransport.failedCleanup()); expect(attempt).toBeTruthy();
  expect(await recover(page, 'stop')).toMatchObject({ settled: false });
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.attemptId).toBe(attempt);
  expect(server.posts).toHaveLength(1);
});

test('read-only second tab cannot remotely stop an already locally stopped launch', async ({ page, context, durableServer: server }) => {
  await loseStart(page, server); expect(await recover(page, 'stop')).toMatchObject({ status: 'unknown' }); server.entry = original(server);
  const follower = await context.newPage();
  try {
    await follower.goto('/tests/e2e/canonical-agentica-transport.html'); await follower.waitForFunction(() => !!window.canonicalTransport);
    await follower.evaluate(() => window.canonicalTransport.reloadSession());
    expect(await recover(follower, 'stop')).toHaveProperty('error'); expect(server.posts).toEqual([]);
  } finally { await follower.evaluate(() => window.canonicalTransport.stop()); await follower.close(); }
});

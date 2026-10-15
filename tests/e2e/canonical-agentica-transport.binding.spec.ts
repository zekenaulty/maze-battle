import { test, expect, loseStart, original, recover, holdLookup } from './canonical-agentica-transport.recovery.test';

test('late announcement of another run blocks the selected Stop target', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server); const held = await holdLookup(page, server);
  const pending = recover(page, 'stop'); await expect.poll(held.entered).toBe(true);
  await page.evaluate(() => window.canonicalTransport.retainAnnouncement('different-run')); held.release();
  expect(await pending).toHaveProperty('error'); expect(server.posts).toEqual([]);
});

for (const changed of ['runId', 'acceptedRequestHash', 'originalRequestHash', 'manifestHash', 'admittedAt'] as const)
  test(`a lost Stop reply cannot redirect retry after ${changed} changes`, async ({ page, durableServer: server }) => {
    await loseStart(page, server); server.entry = original(server); server.failStop = true;
    expect(await recover(page, 'stop')).toHaveProperty('error'); expect(server.posts).toHaveLength(1);
    Reflect.set(server.entry, changed, changed === 'runId' ? 'replacement-run' : changed === 'admittedAt'
      ? '2026-10-15T12:00:01.0000000+00:00' : `sha256:${'e'.repeat(64)}`);
    server.failStop = false;
    expect(await recover(page, 'stop')).toHaveProperty('error'); expect(server.posts).toHaveLength(1);
    expect(server.starts).toHaveLength(1);
  });

test('a conflict discovered after inspection cannot disable local Stop', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server);
  expect(await recover(page, 'inspect')).toMatchObject({ status: 'identified' });
  await page.evaluate(() => window.canonicalTransport.retainAnnouncement('different-run'));
  expect(await recover(page, 'stop')).toHaveProperty('error');
  expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
  expect(server.posts).toEqual([]);
});

test('mutating returned admission metadata cannot retarget a later Stop', async ({ page, durableServer: server }) => {
  await loseStart(page, server); server.entry = original(server);
  await page.evaluate(() => window.canonicalTransport.mutateInspection('replacement-run'));
  server.entry.runId = 'replacement-run';
  expect(await recover(page, 'stop')).toHaveProperty('error'); expect(server.posts).toEqual([]);
});

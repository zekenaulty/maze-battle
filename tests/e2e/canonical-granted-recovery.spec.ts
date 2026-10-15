import { test, expect, boot, ready, state } from './canonical-granted-recovery.setup';

test('after transport release, pending Stop cannot release root and exact settlement can', async ({ page }) => {
  const before = await ready(page), raw = await page.evaluate(() => window.canonicalGrantedRecovery.remote());
  const inspection = await page.evaluate(async () => {
    const c = window.canonicalGrantedRecovery, before = await c.dump(), result = await c.inspect();
    return { result, unchanged: before === await c.dump() };
  });
  expect(inspection).toMatchObject({ unchanged: true, result: { status: 'identified', settled: false, fullStartEquivalence: 'verified' } });
  expect((await state(page)).phase).toBe('closed');
  await page.evaluate(() => window.canonicalGrantedRecovery.successorOutcome());
  expect((await state(page)).head).toEqual(before.head);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop())).toEqual({ status: 'stop-requested', localStopped: true, settled: false });
  const pending = await state(page);
  expect(pending.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(pending.launch!.guard.state).not.toBe('acknowledged');
  expect(pending.head.quota.reservedBytes).toBeGreaterThan(0);
  expect(pending.cleanups.map(c => c.kind)).toEqual(['cancel']);
  await page.evaluate(() => window.canonicalGrantedRecovery.setStop('interrupted'));
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop())).toEqual({ status: 'settled', localStopped: true, settled: true });
  const after = await state(page);
  expect(after.launch!.guard.state).toBe('acknowledged'); expect(after.head.quota.reservedBytes).toBe(0);
  expect(after.head.checkpoint).toEqual(before.head.checkpoint);
  expect(after.launch!.run).toEqual(before.launch!.run); expect(after.launch!.grant).toEqual(before.launch!.grant);
  expect(after.starts).toBe(1);
  for (const request of after.requests.filter(r => r.method === 'POST')) {
    expect(request.localStopped).toBe(true);
    expect(request.body).toEqual({ hostId: before.launch!.binding.start.hostId, sessionId: before.launch!.binding.start.sessionId,
      attemptId: before.launch!.dispatch!.source.attemptId, runId: 'root-run', acceptedRequestHash: (raw as { acceptedRequestHash: string }).acceptedRequestHash });
  }
  const dump = await page.evaluate(() => window.canonicalGrantedRecovery.dump());
  await page.evaluate(() => window.canonicalGrantedRecovery.stop());
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.dump())).toBe(dump);
});

test('initial-only guard remains; refused construction does not occupy granted recovery slot', async ({ page }) => {
  await page.evaluate(() => window.canonicalGrantedRecovery.seed());
  const error = await page.evaluate(() => window.canonicalGrantedRecovery.attach('initial').then(() => '', String));
  expect(error).toContain('not an ungranted start');
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.attach().then(() => '', String))).toContain('already attached');
  await page.evaluate(() => window.canonicalGrantedRecovery.closeTransport());
  await page.evaluate(() => window.canonicalGrantedRecovery.attach());
  const duplicate = await page.evaluate(() => window.canonicalGrantedRecovery.attach().then(() => '', String));
  expect(duplicate).toContain('already attached');
  expect((await state(page)).cleanups).toEqual([]);
});

test('controller local Stop at quota is replayed exactly; pending children represented by terminal null cannot ACK root', async ({ page }) => {
  await page.evaluate(() => window.canonicalGrantedRecovery.seed());
  await page.evaluate(() => window.canonicalGrantedRecovery.closeTransport());
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.quota())).toMatch(/quota/i);
  const originalStop = await page.evaluate(() => window.canonicalGrantedRecovery.localStop());
  await page.evaluate(() => window.canonicalGrantedRecovery.attach());
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop())).toEqual({ status: 'stop-requested', localStopped: true, settled: false });
  const pending = await state(page);
  expect(pending.cleanups.map(c => c.kind)).toEqual(['cancel', 'retry']);
  expect(pending.cleanups[1].request).toEqual(originalStop.request);
  expect(pending.launch!.guard.terminal!.attemptId).toBe(originalStop.request.attemptId);
  expect(pending.head.quota.reservedBytes).toBeGreaterThan(0);
  await page.evaluate(() => window.canonicalGrantedRecovery.setStop('interrupted'));
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).settled).toBe(true);
  const settled = await state(page);
  expect(settled.launch!.guard.terminal!.attemptId).toBe(originalStop.request.attemptId);
  expect(settled.head.quota.reservedBytes).toBe(0);
});

for (const mode of ['undispatched', 'initial', 'announced'] as const) {
  test(`granted recovery rejects ${mode}; initial recovery still settles that original`, async ({ page }) => {
    await page.evaluate(mode => window.canonicalGrantedRecovery.seed(mode), mode);
    expect(await page.evaluate(() => window.canonicalGrantedRecovery.attach().then(() => '', String))).toContain('not an explicitly granted start');
    await page.evaluate(() => { window.canonicalGrantedRecovery.closeTransport(); });
    await page.evaluate(() => window.canonicalGrantedRecovery.attach('initial'));
    if (mode !== 'undispatched') await page.evaluate(() => window.canonicalGrantedRecovery.setStop('stopped'));
    expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('settled');
    const after = await state(page);
    expect(after.launch!.grant).toBeNull(); expect(after.launch!.guard.state).toBe('acknowledged');
    if (mode === 'undispatched') expect(after.requests).toEqual([]);
  });
}

for (const settled of [false, true]) test(`funded cleanup at full ordinary quota, remote settled=${settled}`, async ({ page }) => {
  const before = await ready(page);
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.quota())).toMatch(/quota/i);
  if (settled) await page.evaluate(() => window.canonicalGrantedRecovery.setStop('stopped'));
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).settled).toBe(settled);
  const after = await state(page);
  expect(after.controlled).toBe(false); expect(after.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(after.launch!.guard.state === 'acknowledged').toBe(settled);
  expect(after.head.quota.reservedBytes === 0).toBe(settled);
  expect(after.head.checkpoint).toEqual(before.head.checkpoint);
  expect(after.requests.every(r => r.localStopped)).toBe(true);
});

test('reload recovers historical root without adopting or replacing its run', async ({ page }) => {
  const before = await ready(page), remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalGrantedRecovery);
  await page.evaluate(() => window.canonicalGrantedRecovery.boot());
  const loaded = await state(page);
  expect(loaded.head.epoch).toBeGreaterThan(before.head.epoch);
  expect(loaded.launch!.grant).toEqual(before.launch!.grant);
  await page.evaluate(async remote => {
    const c = window.canonicalGrantedRecovery; c.setRemote(remote); c.setStop('interrupted'); await c.attach();
  }, remote);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('settled');
  const after = await state(page);
  expect(after.launch!.guard.state).toBe('acknowledged'); expect(after.starts).toBe(0);
  expect(after.launch!.run).toEqual(before.launch!.run); expect(after.launch!.grant).toEqual(before.launch!.grant);
  expect(after.head.checkpoint).toEqual(loaded.head.checkpoint);
  expect(after.cleanups.every(c => ['cancel', 'verified-ack'].includes(c.kind))).toBe(true);
});

test('another read-only GameSession can inspect history but cannot Stop without cleanup custody', async ({ page, context }) => {
  await ready(page); const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote());
  const reader = await context.newPage(); const before = await boot(reader); expect(before.controlled).toBe(false);
  await reader.evaluate(async remote => { const c = window.canonicalGrantedRecovery; c.setRemote(remote); await c.attach(); }, remote);
  const dump = await reader.evaluate(() => window.canonicalGrantedRecovery.dump());
  expect((await reader.evaluate(() => window.canonicalGrantedRecovery.inspect())).status).toBe('identified');
  expect(await reader.evaluate(() => window.canonicalGrantedRecovery.stop().then(() => '', String))).toMatch(/custody|control unavailable/);
  expect(await reader.evaluate(() => window.canonicalGrantedRecovery.dump())).toBe(dump);
  expect((await reader.evaluate(() => window.canonicalGrantedRecovery.snapshot())).requests.map(r => r.method)).toEqual(['GET']);
  await reader.evaluate(() => window.canonicalGrantedRecovery.dispose()); await reader.close();
});

test('reload after pending Stop replays the original cancellation source across owner/epoch change', async ({ page }) => {
  await ready(page);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('stop-requested');
  const before = await state(page), originalStop = before.cleanups[0].request!;
  const remote = await page.evaluate(() => window.canonicalGrantedRecovery.remote());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalGrantedRecovery);
  await page.evaluate(() => window.canonicalGrantedRecovery.boot());
  await page.evaluate(async remote => {
    const c = window.canonicalGrantedRecovery; c.setRemote(remote); c.setStop('interrupted'); await c.attach();
  }, remote);
  expect((await page.evaluate(() => window.canonicalGrantedRecovery.stop())).status).toBe('settled');
  const after = await state(page);
  expect(after.head.epoch).toBeGreaterThan(before.head.epoch);
  expect(after.cleanups.map(c => c.kind)).toEqual(['retry', 'verified-ack']);
  expect(after.cleanups[0].request).toEqual(originalStop);
  expect(after.launch!.guard.terminal!.attemptId).toBe(originalStop.attemptId);
  expect(after.head.quota.reservedBytes).toBe(0);
});

test('missing original is UNKNOWN even after local Stop; no POST and no ACK', async ({ page }) => {
  await ready(page); await page.evaluate(() => window.canonicalGrantedRecovery.missing());
  expect(await page.evaluate(() => window.canonicalGrantedRecovery.stop())).toMatchObject({ status: 'unknown', settled: false, localStopped: true });
  const after = await state(page);
  expect(after.cleanups.map(c => c.kind)).toEqual(['cancel']); expect(after.requests.map(r => r.method)).toEqual(['GET']);
  expect(after.head.quota.reservedBytes).toBeGreaterThan(0);
});

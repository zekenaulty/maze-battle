import { test, expect, initialized, takeover } from './canonical-operation-transfer.test';

for (const stage of ['intent', 'lost-ack', 'ack', 'guard', 'navigation', 'authority'] as const)
  test(`funded Stop at ${stage} settles transferred epoch with no ordinary writes, including after reload`, async ({ page }) => {
    const { seed, remote } = await initialized(page); await takeover(page, seed);
    await page.evaluate(() => window.canonicalOperationTransfer.prepare());
    const count = { intent: 0, 'lost-ack': 1, ack: 1, guard: 2, navigation: 3, authority: 4 }[stage];
    if (stage === 'lost-ack') remote.loseReply();
    for (let i = 0; i < count; i++) await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String));
    const retained = (await page.evaluate(() => window.canonicalOperationTransfer.state())).retained!;
    await takeover(page, seed);
    expect(String(await page.evaluate(() => window.canonicalOperationTransfer.quota()))).toContain('quota');
    await page.evaluate(() => window.canonicalOperationTransfer.cancel());
    const before = await page.evaluate(() => window.canonicalOperationTransfer.terminal());
    expect(before!.event).toMatchObject({ kind: 'cancelled', sessionEpoch: retained.intent.data.event.nextSessionEpoch, sequence: 3 });
    const prefix = await page.evaluate(() => window.canonicalOperationTransfer.pulse());
    if (stage === 'intent') {
      expect(prefix.status).toBe('terminal-prefix-delivered');
      expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('terminal-acknowledged');
    } else expect(prefix.status).toBe('terminal-acknowledged');
    const after = await page.evaluate(() => window.canonicalOperationTransfer.terminal());
    expect(after!.bound.operation.state).toBe('acknowledged'); expect(after!.bound.launch.guard.terminal!.disposition).toBe('cancelled');
    expect(after!.event).toEqual(before!.event); expect(remote.entry.activeEpoch).toBe(retained.intent.data.event.nextSessionEpoch);
    expect(remote.entry.state).toBe('cancelled');
    expect((await page.evaluate(() => window.canonicalOperationTransfer.state())).retained).toEqual(retained);
    expect(await page.evaluate(() => window.canonicalOperationTransfer.prepare().catch(String))).toContain('Game control unavailable');
  });

test('terminal navigation refuses transfer intent even with fresh publication', async ({ page }) => {
  const { seed } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.cancel());
  expect(await page.evaluate(() => window.canonicalOperationTransfer.prepare().catch(String))).toContain('only unfinished navigation');
});

for (const field of ['missing', 'epoch', 'observation', 'request', 'usage', 'waking'] as const)
  test(`transfer ACK rejects ${field} without adopting or granting motion`, async ({ page }) => {
    const { seed, remote } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare());
    remote.corruptReply(e => {
      if (field === 'missing') delete e.latestEvent;
      if (field === 'epoch') e.activeEpoch = seed.action.sessionEpoch;
      if (field === 'observation') e.latestEvent!.observation.revision++;
      if (field === 'request') e.request.objective += ' changed';
      if (field === 'usage') e.usage.providerCalls++;
      if (field === 'waking') e.state = 'waking';
    });
    const before = await page.evaluate(() => window.canonicalOperationTransfer.state());
    expect(typeof await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String))).toBe('string');
    const after = await page.evaluate(() => window.canonicalOperationTransfer.state());
    expect(after.head.revision).toBe(before.head.revision); expect(after.retained!.ack).toBeNull(); expect(after.retained!.authority).toBeUndefined();
    expect(await page.evaluate(() => window.canonicalOperationTransfer.advanceDirect().catch(String))).toMatch(/explicit (transfer )?adoption/);
  });

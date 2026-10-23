import { test, expect, initialized, takeover, authorize } from './canonical-operation-transfer.test';

test('Stop settles at accepted transfer epoch while its ACK response is still in flight, under quota refusal', async ({ page }) => {
  const { seed, remote } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare());
  remote.holdReply();
  const pending = page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String));
  try {
    await expect.poll(() => remote.entry.latestEvent?.kind).toBe('transfer');
    const accepted = remote.entry.latestEvent!;
    expect(String(await page.evaluate(() => window.canonicalOperationTransfer.quota()))).toContain('quota');
    await page.evaluate(() => window.canonicalOperationTransfer.cancel());
    expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('terminal-acknowledged');
    expect(remote.entry.latestEvent).toMatchObject({ kind: 'cancelled', sessionEpoch: accepted.nextSessionEpoch, sequence: accepted.sequence + 1 });
    remote.releaseReply(); expect(await pending).toContain('Game control unavailable');
    const state = await page.evaluate(() => window.canonicalOperationTransfer.state());
    if (state.value?.kind !== 'navigation') throw Error('Expected navigation operation');
    expect(state.retained!.ack).toBeNull(); expect(state.retained!.authority).toBeUndefined(); expect(state.value.progress.steps).toBe(0);
  } finally { remote.releaseReply(); await pending; }
});

test('funded Stop delivers retained post-transfer progress before terminal, without ordinary progress ACK', async ({ page }) => {
  const { seed, remote } = await initialized(page); await takeover(page, seed);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare()); await authorize(page);
  await page.evaluate(() => window.canonicalOperationTransfer.pulse());
  const progress = (await page.evaluate(() => window.canonicalOperationTransfer.state())).value!.event!;
  expect(String(await page.evaluate(() => window.canonicalOperationTransfer.quota()))).toContain('quota');
  await page.evaluate(() => window.canonicalOperationTransfer.cancel());
  expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse())).toMatchObject({ status: 'terminal-prefix-delivered', sequence: 3 });
  expect(remote.entry.latestEvent).toEqual(progress.data.event);
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('terminal-acknowledged');
  const terminal = await page.evaluate(() => window.canonicalOperationTransfer.terminal());
  expect(terminal!.event).toMatchObject({ sequence: 4, kind: 'cancelled', sessionEpoch: remote.entry.activeEpoch });
  expect((await page.evaluate(() => window.canonicalOperationTransfer.state())).value!.acknowledgement).toBeNull();
});

test('arrival after transfer settles locally and remains decision-required, with no implicit wake or successor', async ({ page }) => {
  const { seed, remote } = await initialized(page); await takeover(page, seed);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare()); await authorize(page);
  for (let i = 0; i < 2; i++) {
    expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('advanced');
    expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('acknowledged');
  }
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('advanced');
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('locally-settled');
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('decision-required');
  expect(remote.entry.state).toBe('parked'); expect(remote.entry.activeEpoch).not.toBe(seed.action.sessionEpoch);
  expect(remote.sent.map(e => e.kind)).toEqual(['progress', 'transfer', 'progress', 'progress']);
  expect(await page.evaluate(() => window.canonicalOperationTransfer.prepare().catch(String))).toContain('only unfinished navigation');
});

test('remote capacity refusal leaves funded local cancellation unresolved; exact terminal retry releases only on ACK', async ({ page }) => {
  const { seed, remote } = await initialized(page); await takeover(page, seed);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare()); await authorize(page);
  await page.evaluate(() => window.canonicalOperationTransfer.cancel()); remote.refuseCapacity();
  expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse().catch(String))).toContain('Fixture retention full');
  const held = await page.evaluate(() => window.canonicalOperationTransfer.state());
  expect(held.value!.operation.state).toBe('settled'); expect(held.head.allocations[seed.operationId]).toBeDefined();
  expect(remote.entry.state).toBe('parked'); const first = remote.sent.at(-1);
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('terminal-acknowledged');
  expect(remote.sent.at(-1)).toEqual(first);
  expect((await page.evaluate(() => window.canonicalOperationTransfer.state())).head.allocations[seed.operationId]).toBeUndefined();
});

test('publication changed after transfer ACK cannot authorize movement even after both kernel adoptions', async ({ page }) => {
  const { seed } = await initialized(page); await takeover(page, seed);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare());
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.canonicalOperationTransfer.transferPulse());
  await page.evaluate(() => window.canonicalOperationTransfer.changeCheckpoint());
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String))).toContain('publication game state or custody changed');
  expect(await page.evaluate(() => window.canonicalOperationTransfer.advanceDirect().catch(String))).toContain('explicit transfer adoption');
  await page.evaluate(() => window.canonicalOperationTransfer.cancel());
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('terminal-acknowledged');
});

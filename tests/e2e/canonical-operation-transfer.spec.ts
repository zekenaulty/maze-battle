import { test, expect, initialized, takeover, authorize } from './canonical-operation-transfer.test';

test('explicit ACK and both kernel receipts gate movement; repeated takeovers keep semantic sequence independent', async ({ page }) => {
  const { seed, remote, original } = await initialized(page);
  for (let i = 0; i < 2; i++) {
    await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare());
    for (const status of ['transfer-acknowledged', 'kernel-adopted', 'kernel-adopted', 'navigation-authorized']) {
      const before = await page.evaluate(() => window.canonicalOperationTransfer.state());
      expect(await page.evaluate(() => window.canonicalOperationTransfer.advanceDirect().catch(String))).toMatch(/explicit (transfer )?adoption/);
      expect((await page.evaluate(() => window.canonicalOperationTransfer.state())).head.revision).toBe(before.head.revision);
      expect((await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).status).toBe(status);
    }
    const authorized = await page.evaluate(() => window.canonicalOperationTransfer.state());
    const intent = authorized.retained!.intent;
    expect(intent.data.event.observation.observationId).toBe(`transfer-${intent.source.attemptId}`);
    expect(intent.data.event.observation.observationId).not.toBe(intent.data.publication.id);
    expect(intent.data.event.observation.data.source).toEqual(intent.publication.observation);
    expect(intent.data.event.observation.revision).toBe(intent.publication.wireRevision);
    expect(authorized.value!.confirmation).toEqual(original.value!.confirmation);
    expect(authorized.retained!.authority!.value).toMatchObject({ data: {
      guardAdoption: `${authorized.retained!.intent.reference.id}:guard`, navigationAdoption: `${authorized.retained!.intent.reference.id}:navigation` } });
    expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse())).toMatchObject({ status: 'advanced', sequence: i + 1 });
    const advanced = await page.evaluate(() => window.canonicalOperationTransfer.state());
    expect(advanced.value!.event!.data.event).toMatchObject({ sequence: 3 + i * 2, sessionEpoch: String(advanced.head.epoch) });
    expect(advanced.value!.event!.data.previous.kind).toBe('transfer');
    expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse())).toMatchObject({ status: 'acknowledged' });
    expect(advanced.stats.reads).toBeLessThan(2048);
  }
  expect(remote.sent.map(e => e.kind)).toEqual(['progress', 'transfer', 'progress', 'transfer', 'progress']);
  expect(remote.entry.action).toEqual(seed.action); expect(remote.entry.request).toEqual(seed.entry.request);
  expect(remote.entry.admission).toEqual(seed.entry.admission);
});

test('lost service reply retries the exact retained event after reload before an explicit newer takeover', async ({ page }) => {
  const { seed, remote } = await initialized(page); await takeover(page, seed);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare()); remote.loseReply();
  expect(typeof await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String))).toBe('string');
  const event = remote.sent.at(-1)!;
  await takeover(page, seed);
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).toEqual({ status: 'transfer-acknowledged' });
  expect(remote.sent.at(-1)).toEqual(event);
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).toEqual({ status: 'takeover-required' });
  expect(await page.evaluate(() => window.canonicalOperationTransfer.advanceDirect().catch(String))).toMatch(/explicit (transfer )?adoption/);
  await page.evaluate(() => window.canonicalOperationTransfer.prepare()); await authorize(page);
  expect((await page.evaluate(() => window.canonicalOperationTransfer.pulse())).status).toBe('advanced');
  const state = await page.evaluate(() => window.canonicalOperationTransfer.state());
  expect(state.value!.event!.data.event.sequence).toBe(4); expect(state.value!.progress.sequence).toBe(1);
});

test('lost committed kernel reply reuses the exact adoption receipt and cannot duplicate adoption', async ({ page }) => {
  const { seed } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare());
  await page.evaluate(() => window.canonicalOperationTransfer.transferPulse());
  await page.evaluate(() => window.canonicalOperationTransfer.loseKernelReply());
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String))).toContain('lost committed kernel');
  const guard = (await page.evaluate(() => window.canonicalOperationTransfer.state())).retained!;
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).toEqual({ status: 'kernel-adopted', kind: 'navigation' });
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse())).toEqual({ status: 'navigation-authorized' });
  expect((await page.evaluate(() => window.canonicalOperationTransfer.state())).retained!.ack).toEqual(guard.ack);
});

test('generic adoption alone cannot manufacture explicit transfer authority', async ({ page }) => {
  const { seed } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare());
  await page.evaluate(() => window.canonicalOperationTransfer.transferPulse());
  await page.evaluate(() => window.canonicalOperationTransfer.genericAdopt());
  expect(await page.evaluate(() => window.canonicalOperationTransfer.authorize().catch(String))).toContain('missing source receipt');
  expect(await page.evaluate(() => window.canonicalOperationTransfer.transferPulse().catch(String))).toContain('missing source receipt');
  expect(await page.evaluate(() => window.canonicalOperationTransfer.advanceDirect().catch(String))).toContain('explicit transfer adoption');
});

for (const kind of ['guard', 'navigation'] as const) test(`${kind} receipt remains required after final authority`, async ({ page }) => {
  const { seed } = await initialized(page); await takeover(page, seed); await page.evaluate(() => window.canonicalOperationTransfer.prepare()); await authorize(page);
  await page.evaluate(kind => window.canonicalOperationTransfer.corruptAdoptionReceipt(kind), kind);
  expect(await page.evaluate(() => window.canonicalOperationTransfer.pulse().catch(String))).toContain('explicit transfer adoption receipt changed');
});

import { test, expect } from './canonical-pregrant-proof.test';

test('cancelled ungranted successor yields only a deterministic unavailable proof with zero writes', async ({ page }) => {
  const { pending } = await page.evaluate(() => window.canonicalPregrantProof.boot());
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  const measured = await page.evaluate(() => window.canonicalPregrantProof.measured());
  const cancelled = await page.evaluate(() => window.canonicalPregrantProof.state());
  expect(measured.modes.length).toBeGreaterThan(0); expect(measured.modes.every(mode => mode === 'readonly')).toBe(true);
  expect(measured.result).toEqual({ actionId: pending.actionId, sessionId: pending.sessionId, sessionEpoch: pending.sessionEpoch,
    disposition: 'unavailable', beforeRevision: cancelled.launch.guard.revision, afterRevision: cancelled.launch.guard.revision,
    evidenceId: expect.stringMatching(/^pregrant-unavailable:[a-f0-9]{64}$/),
    summary: 'Root cancelled before successor execution authority was granted. No host effect was performed.' });
  expect(await page.evaluate(() => window.canonicalPregrantProof.prove())).toEqual(measured.result);
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
  expect(cancelled.grant).toBeNull(); expect(cancelled.launch.guard.state).toBe('settled');
});

test('root ACK and later owner/revision changes preserve the original proof byte for byte', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot());
  const original = await page.evaluate(() => window.canonicalPregrantProof.prove());
  await page.evaluate(() => window.canonicalPregrantProof.acknowledgeRoot());
  const acked = await page.evaluate(() => window.canonicalPregrantProof.state());
  expect(acked.launch.guard.state).toBe('acknowledged'); expect(acked.launch.guard.revision).toBeGreaterThan(original.afterRevision);
  expect(await page.evaluate(() => window.canonicalPregrantProof.prove())).toEqual(original);
  const snapshot = await page.evaluate(() => window.canonicalPregrantProof.snapshot());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalPregrantProof);
  const next = await page.evaluate(snapshot => window.canonicalPregrantProof.restore(snapshot), snapshot);
  expect(next.owner).not.toBe(acked.head.owner); expect(next.epoch).toBeGreaterThan(acked.head.epoch);
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  expect(await page.evaluate(() => window.canonicalPregrantProof.prove())).toEqual(original);
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('cross-epoch intent uses its adoption publication and survives another reload', async ({ page }) => {
  const { pending, parent } = await page.evaluate(() => window.canonicalPregrantProof.boot({ crossEpoch: true }));
  expect(pending.sessionEpoch).not.toBe(parent.sessionEpoch);
  const original = await page.evaluate(() => window.canonicalPregrantProof.prove());
  const snapshot = await page.evaluate(() => window.canonicalPregrantProof.snapshot());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalPregrantProof);
  await page.evaluate(snapshot => window.canonicalPregrantProof.restore(snapshot), snapshot);
  expect(await page.evaluate(() => window.canonicalPregrantProof.prove())).toEqual(original);
});

test('a successor parent validates its original binding without creating another window', async ({ page }) => {
  const { pending, parent } = await page.evaluate(() => window.canonicalPregrantProof.boot({ successorParent: true }));
  expect(pending.runId).not.toBe(parent.runId);
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  const original = await page.evaluate(() => window.canonicalPregrantProof.prove());
  expect(original.disposition).toBe('unavailable');
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
  await page.evaluate(() => window.canonicalPregrantProof.acknowledgeRoot());
  expect(await page.evaluate(() => window.canonicalPregrantProof.prove())).toEqual(original);
});

test('logical quota exhaustion cannot require a new proof record or release funding', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot());
  await page.evaluate(() => window.canonicalPregrantProof.fillQuota());
  const before = await page.evaluate(() => window.canonicalPregrantProof.dump());
  const result = await page.evaluate(() => window.canonicalPregrantProof.measured());
  expect(result.result.disposition).toBe('unavailable'); expect(result.modes.every(mode => mode === 'readonly')).toBe(true);
  expect(await page.evaluate(() => window.canonicalPregrantProof.dump())).toBe(before);
});

test('captures fence, prepared parent, binding and full pending input before the first await', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot());
  const original = await page.evaluate(() => window.canonicalPregrantProof.prove());
  expect(await page.evaluate(() => window.canonicalPregrantProof.captureInputs())).toEqual(original);
});

test('full pending input changes proof identity, never aliases the original service request', async ({ page }) => {
  const { pending } = await page.evaluate(() => window.canonicalPregrantProof.boot());
  const original = await page.evaluate(() => window.canonicalPregrantProof.prove());
  const changed = { ...pending, arguments: { scope: 'room' } };
  const other = await page.evaluate(action => window.canonicalPregrantProof.prove(action), changed);
  expect(other.evidenceId).not.toBe(original.evidenceId);
  expect(await page.evaluate(action => window.canonicalPregrantProof.prove(action), pending)).toEqual(original);
});

test('old pregrant callbacks and a late grant cannot create authority after local Stop', async ({ page }) => {
  await page.evaluate(() => window.canonicalPregrantProof.boot({ cancel: false }));
  const old = await page.evaluate(() => window.canonicalPregrantProof.oldCallbacks());
  for (const failure of [old.save, old.action, old.fresh, old.grant]) expect(failure).not.toBe('unexpected success');
  expect(old.result.disposition).toBe('unresolved'); expect(old.unchanged).toBe(true);
  expect((await page.evaluate(() => window.canonicalPregrantProof.prove())).disposition).toBe('unavailable');
});

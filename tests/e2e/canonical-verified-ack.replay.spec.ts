import { expect, test } from './canonical-verified-ack.test';
import type { CanonicalRequest, JsonObject } from '../../src/persistence/canonical/types';

test('exact committed replay survives reload and takeover without verification or release', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled();
    const commit = await c.acknowledgeCanonical(ack, async () => {});
    await c.controlCanonical(await c.fresh('control.takeover', { owner: 'replacement-owner' }), 'takeover');
    return { ack, receipt: commit.receipt, before: await c.dump() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.verifiedAck);
  const result = await page.evaluate(async serialized => {
    const { ack } = JSON.parse(serialized) as { ack: CanonicalRequest };
    const c = window.verifiedAck; let invoked = false;
    const replay = await c.acknowledgeCanonical(ack, async () => { invoked = true; throw new Error('Must not verify an old ACK'); });
    const retryOnly = await c.replayAcknowledgement(ack);
    return { replay, retryOnly, invoked, after: await c.dump() };
  }, JSON.stringify(original));
  expect(result.invoked).toBe(false);
  expect(result.replay).toMatchObject({ replayed: true, receipt: original.receipt });
  expect(result.retryOnly).toMatchObject({ replayed: true, receipt: original.receipt });
  expect(result.after).toEqual(original.before);
});

test('changing exact retry proof refuses without invoking verifier or changing any store', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(); await c.acknowledgeCanonical(ack, async () => {});
    const changed = structuredClone(ack); (changed.input as JsonObject).proof = { accepted: false };
    const before = await c.dump(); let invoked = false;
    const direct = await c.failure(() => c.acknowledgeCanonical(changed, async () => { invoked = true; }));
    const retryOnly = await c.failure(() => c.replayAcknowledgement(changed));
    return { direct, retryOnly, invoked, before, after: await c.dump() };
  });
  expect(result.direct).toContain('invalid original receipt'); expect(result.retryOnly).toContain('invalid original receipt');
  expect(result.invoked).toBe(false); expect(result.after).toEqual(result.before);
});

test('retry-only cannot create a first ACK or release the reservation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump();
    const error = await c.failure(() => c.replayAcknowledgement(ack));
    const after = await c.dump(), commit = await c.acknowledgeCanonical(ack, async () => {});
    return { error, before, after, commit };
  });
  expect(result.error).toContain('original verification is required'); expect(result.after).toEqual(result.before);
  expect(result.commit.replayed).toBe(false);
});

test('retry-only refuses a deleted committed receipt without releasing another operation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(); await c.acknowledgeCanonical(ack, async () => {});
    await c.admit('other-funded-operation');
    const db = await c.openCanonicalDatabase();
    try { await db.delete('receipts', [ack.expected.gameId, ack.attemptId]); } finally { db.close(); }
    const before = await c.dump(); const error = await c.failure(() => c.replayAcknowledgement(ack));
    return { error, before, after: await c.dump(), quota: (await c.readCanonicalHead()).head.quota };
  });
  expect(result.error).not.toBe(''); expect(result.after).toEqual(result.before);
  expect(result.quota.reservations).toBe(1); expect(result.quota.reservedBytes).toBe(131072 + 16384);
});

test('failed verification can retry the original proof but a committed attempt cannot be reused', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled();
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async () => { throw new Error('Unconfirmed remote'); }));
    const commit = await c.acknowledgeCanonical(ack, async () => {}), before = await c.dump();
    const duplicate = await c.fresh('operation.acknowledge', ack.input);
    const fresh = await c.failure(() => c.acknowledgeCanonical(duplicate, async () => {}));
    return { error, commit, fresh, before, after: await c.dump() };
  });
  expect(result.error).toContain('Unconfirmed remote'); expect(result.commit.replayed).toBe(false);
  expect(result.fresh).toContain('operation phase changed'); expect(result.after).toEqual(result.before);
});

test('stale-custody fresh ACK is refused; current stopped custody can verify without resume or adoption', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled();
    await c.controlCanonical(await c.fresh('control.takeover', { owner: 'replacement-owner' }), 'takeover');
    const before = await c.dump(); let invoked = false;
    const stale = await c.failure(() => c.acknowledgeCanonical(ack, async () => { invoked = true; }));
    const after = await c.dump(); const current = await c.fresh('operation.acknowledge', ack.input);
    await c.acknowledgeCanonical(current, async view => {
      const operation = await view.liveOperation('verified-operation');
      if (operation?.owner !== 'verified-owner') throw new Error('Unexpected implicit adoption');
    });
    return { stale, invoked, before, after, head: (await c.readCanonicalHead()).head };
  });
  expect(result.stale).toContain('stale owner or revision'); expect(result.invoked).toBe(false);
  expect(result.after).toEqual(result.before);
  expect(result.head).toMatchObject({ status: 'stopped', owner: 'replacement-owner', quota: { reservations: 0, reservedBytes: 0 } });
});

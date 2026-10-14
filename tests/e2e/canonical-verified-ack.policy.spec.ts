import { expect, test } from './canonical-verified-ack.test';
import type { CanonicalRequest, JsonObject } from '../../src/persistence/canonical/types';

test('host-linked admission without the policy rolls back its callback and reservation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck; await c.seed(); const before = await c.dump(); let invoked = false;
    const request = await c.fresh('operation.admit', { operationId: 'linked', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES });
    const error = await c.failure(() => c.operateCanonical(request, 'admit', async tx => {
      invoked = true; await tx.pages.set('execution', 'not-committed', true); tx.setCheckpoint({ changed: true });
      return { host: { actionResult: { key: 'wire-result' } } };
    }));
    return { error, invoked, before, after: await c.dump() };
  });
  expect(result.error).toContain('host-linked operation requires verified acknowledgement policy');
  expect(result.invoked).toBe(true); expect(result.after).toEqual(result.before);
});

test('generic ACK cannot use proof or release a verified operation without proof', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(); const before = await c.dump();
    const proof = await c.failure(() => c.operateCanonical(ack, 'acknowledge'));
    const bare = structuredClone(ack); delete (bare.input as JsonObject).proof;
    const missing = await c.failure(() => c.operateCanonical(bare, 'acknowledge'));
    return { proof, missing, before, after: await c.dump() };
  });
  expect(result.proof).toContain('requires its verifier'); expect(result.missing).toContain('admitted acknowledgement policy');
  expect(result.after).toEqual(result.before);
});

test('unverified operations reject the verified path but retain generic ACK', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled(false); let invoked = false; const before = await c.dump();
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async () => { invoked = true; }));
    const after = await c.dump(), bare = structuredClone(ack); delete (bare.input as JsonObject).proof;
    await c.operateCanonical(bare, 'acknowledge');
    return { error, invoked, before, after, quota: (await c.readCanonicalHead()).head.quota };
  });
  expect(result.error).toContain('admitted acknowledgement policy'); expect(result.invoked).toBe(false);
  expect(result.after).toEqual(result.before); expect(result.quota.reservations).toBe(0);
});

for (const mutation of ['row-policy', 'source-policy', 'source-link'] as const) test(`${mutation} removal cannot enable a generic ACK`, async ({ page }) => {
  const result = await page.evaluate(async mutation => {
    const c = window.verifiedAck, { admission, ack } = await c.settled(), db = await c.openCanonicalDatabase();
    try {
      if (mutation === 'row-policy') {
        const row = (await db.get('operations', [ack.expected.gameId, 'verified-operation']))!;
        const { witness: _witness, ackPolicy: _policy, ...body } = row;
        await db.put('operations', c.sealOperation(body), [row.gameId, row.id]);
      } else {
        const receipt = (await db.get('receipts', [admission.expected.gameId, admission.attemptId]))!;
        if (mutation === 'source-policy') {
          const request = JSON.parse(receipt.fingerprint) as CanonicalRequest;
          delete (request.input as JsonObject).ackPolicy; receipt.fingerprint = c.fingerprint(request);
        } else delete (receipt.result as JsonObject).host;
        await db.put('receipts', receipt, [receipt.gameId, receipt.attemptId]);
      }
    } finally { db.close(); }
    delete (ack.input as JsonObject).proof; const before = await c.dump();
    const error = await c.failure(() => c.operateCanonical(ack, 'acknowledge'));
    return { error, before, after: await c.dump() };
  }, mutation);
  expect(result.error).toContain(mutation === 'source-link' ? 'admitted acknowledgement policy' : 'original reservation changed');
  expect(result.after).toEqual(result.before);
});

test('a verified historical ACK cannot lose the proof in its original receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck, { ack } = await c.settled();
    await c.acknowledgeCanonical(ack, async () => {});
    const db = await c.openCanonicalDatabase();
    try {
      const receipt = (await db.get('receipts', [ack.expected.gameId, ack.attemptId]))!;
      const request = JSON.parse(receipt.fingerprint) as CanonicalRequest;
      delete (request.input as JsonObject).proof; receipt.fingerprint = c.fingerprint(request);
      await db.put('receipts', receipt, [receipt.gameId, receipt.attemptId]);
    } finally { db.close(); }
    return c.failure(() => c.readCanonical(p => p.liveOperation('verified-operation')));
  });
  expect(result, 'The original source must retain the admitted verified-host policy evidence').not.toBe('');
});

import { expect, test } from './canonical-verified-ack.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('sixteen funded operations cancel and ACK at normal quota with maximum escaped proofs and IDs', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.verifiedAck; await c.seed('o'.repeat(128));
    const ids = Array.from({ length: c.MAX_RESERVATIONS }, (_, i) => `op${i}`.padEnd(128, 'i'));
    const binding = { escaped: '"\\'.repeat(1020) };
    binding.escaped += 'x'.repeat(4096 - c.jsonBytes(binding));
    for (const [i, operationId] of ids.entries()) {
      const admission = await c.fresh('operation.admit', { operationId, terminalBytes: c.MIN_TERMINAL_BYTES,
        ackPolicy: 'verified-host', binding }, `admit${i}`.padEnd(128, 'a'));
      await c.operateCanonical(admission, 'admit', async () => ({ host: { actionResult: { key: 'wire-result' } } }));
    }
    const full = (await c.readCanonicalHead()).head, beforeLimit = await c.dump();
    const seventeenth = await c.failure(() => c.admit('seventeenth'));
    const afterLimit = await c.dump(), writes = await c.fillNormalCapacity();
    const normal = await c.fresh('fixture.fill', {}), exhausted = await c.failure(() => c.executeCanonical(normal, async () => null));
    const quotaHead = (await c.readCanonicalHead()).head;
    await c.controlCanonical(await c.fresh('control.stop', { owner: quotaHead.owner }), 'stop');
    const proof = c.maximumProof(), sizes: { terminal: number; acknowledgement: number }[] = [], counts: number[] = [];
    let proofCopies = true;
    // Cancel every operation before any ACK to prove terminal release alone does not free a slot.
    const terminals = [];
    for (const [i, operationId] of ids.entries()) {
      const before = (await c.readCanonicalHead()).head;
      const request = await c.fresh('operation.cancel', { operationId }, `cancel${i}`.padEnd(128, 'c'));
      await c.operateCanonical(request, 'cancel'); terminals.push(request);
      const after = (await c.readCanonicalHead()).head;
      sizes.push({ terminal: after.quota.usedBytes - before.quota.usedBytes, acknowledgement: 0 });
      counts.push(after.quota.reservations);
    }
    const settled = (await c.readCanonicalHead()).head;
    for (const [i, terminal] of terminals.entries()) {
      const before = (await c.readCanonicalHead()).head;
      const ack = await c.fresh('operation.acknowledge', { operationId: ids[i], terminalAttemptId: terminal.attemptId, proof }, `ack${i}`.padEnd(128, 'k'));
      const commit = await c.acknowledgeCanonical(ack, async view => {
        const source = await view.sourceReceipt(terminal.attemptId);
        if (source.receipt.attemptId !== terminal.attemptId) throw new Error('Wrong terminal source');
      });
      const after = (await c.readCanonicalHead()).head;
      sizes[i].acknowledgement = after.quota.usedBytes - before.quota.usedBytes;
      proofCopies &&= JSON.stringify((JSON.parse(commit.receipt.fingerprint).input as JsonObject).proof) === JSON.stringify(proof)
        && !Object.hasOwn(commit.receipt.result as JsonObject, 'proof');
    }
    return { full, seventeenth, beforeLimit, afterLimit, writes, exhausted, quotaHead, settled, counts, sizes,
      proofBytes: c.jsonBytes(proof), bindingBytes: c.jsonBytes(binding), proofCopies, final: (await c.readCanonicalHead()).head, dump: await c.dump() };
  });
  expect(result.full.quota.reservations).toBe(16); expect(result.seventeenth).toContain('pending operation limit');
  expect(result.afterLimit).toEqual(result.beforeLimit); expect(result.writes).toBeGreaterThan(0);
  expect(result.exhausted).toContain('storage quota exhausted'); expect(result.proofBytes).toBe(6144);
  expect(result.bindingBytes).toBe(4096); expect(result.proofCopies).toBe(true);
  expect(result.counts).toEqual(Array(16).fill(16));
  expect(result.settled.quota).toMatchObject({ reservations: 16, reservedBytes: 16 * 16384 });
  for (const size of result.sizes) { expect(size.terminal).toBeLessThanOrEqual(131072); expect(size.acknowledgement).toBeLessThanOrEqual(16384); }
  expect(result.final.status).toBe('stopped'); expect(result.final.roots).toEqual(result.full.roots);
  expect(result.final.quota).toMatchObject({ reservations: 0, reservedBytes: 0, usedBytes: result.dump.bytes });
  console.log(JSON.stringify({ proofBytes: result.proofBytes, maxAckCharge: Math.max(...result.sizes.map(s => s.acknowledgement)),
    maxCancelCharge: Math.max(...result.sizes.map(s => s.terminal)), reservations: 16, normalQuotaReached: true }));
});

for (const kind of ['too-large', 'not-object'] as const) test(`${kind} proof is refused before verifier or storage changes`, async ({ page }) => {
  const result = await page.evaluate(async kind => {
    const c = window.verifiedAck, { ack } = await c.settled(), before = await c.dump(); let invoked = false;
    const proof = c.maximumProof(); proof.data = `${proof.data}x`;
    (ack.input as JsonObject).proof = kind === 'too-large' ? proof : [];
    const error = await c.failure(() => c.acknowledgeCanonical(ack, async () => { invoked = true; }));
    return { error, invoked, before, after: await c.dump() };
  }, kind);
  expect(result.error).not.toBe(''); expect(result.invoked).toBe(false); expect(result.after).toEqual(result.before);
});

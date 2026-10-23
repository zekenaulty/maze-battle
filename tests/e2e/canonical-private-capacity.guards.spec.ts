import { expect, test } from './canonical-private-capacity.test';
import type { AcknowledgementVerifier } from '../../src/persistence/canonical/acknowledgement';

test('verified-host ACK reads exact sources under malformed policy; wrong proof cannot release reserve', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.privateCapacityFixture, original = await c.seed('verified-host');
    const damaged = await c.damagePolicy('tampered'), before = await c.dump();
    await c.controlCanonical(c.command(damaged.head, 'control.takeover', { owner: 'verified-rescuer' }), 'takeover');
    const cancel = c.command(await c.current(), 'operation.cancel', { operationId: 'funded-original' });
    const cancelled = await c.operateCanonical(cancel, 'cancel'), terminal = await c.current();
    const proof = { admissionAttemptId: original.admission.attemptId, terminalAttemptId: cancel.attemptId };
    const ack = c.command(terminal, 'operation.acknowledge', { operationId: 'funded-original', terminalAttemptId: cancel.attemptId, proof });
    const verified: unknown[] = [];
    const verify: AcknowledgementVerifier = async (pages, input) => {
      const admission = await pages.sourceReceipt(original.admission.attemptId), source = await pages.sourceReceipt(cancel.attemptId);
      const operation = await pages.liveOperation('funded-original');
      if (JSON.stringify(admission.receipt) !== JSON.stringify(original.admitted.receipt)
        || JSON.stringify(source.receipt) !== JSON.stringify(cancelled.receipt)
        || operation?.admissionAttemptId !== proof.admissionAttemptId || operation.terminal?.attemptId !== proof.terminalAttemptId
        || JSON.stringify(Reflect.get(input.input as object, 'proof')) !== JSON.stringify(proof)) throw Error('fixture acknowledgement source mismatch');
      verified.push({ admission, source, operation, input });
    };
    const wrongProof = await c.refusal(() => c.acknowledgeCanonical({ ...ack, input: { operationId: 'funded-original',
      terminalAttemptId: cancel.attemptId, proof: { ...proof, admissionAttemptId: 'foreign-admission' } } }, verify));
    const plainAck = await c.refusal(() => c.operateCanonical(c.command(terminal, 'operation.acknowledge', {
      operationId: 'funded-original', terminalAttemptId: cancel.attemptId }), 'acknowledge'));
    const acknowledged = await c.acknowledgeCanonical(ack, verify), after = await c.dump();
    const replay = await c.replayAcknowledgement(ack);
    return { original, damaged, before, cancel, cancelled, terminal, ack, wrongProof, plainAck, verified, acknowledged,
      after, replay, final: await c.current(), replayDump: await c.dump() };
  });
  await info.attach('verified-cleanup.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(r.wrongProof.error).toContain('fixture acknowledgement source mismatch'); expect(r.plainAck.error).toContain('admitted acknowledgement policy');
  for (const refusal of [r.wrongProof, r.plainAck]) expect(refusal.after).toEqual(refusal.before);
  expect(r.verified).toHaveLength(1); expect(r.replay.replayed).toBe(true); expect(r.replay.receipt).toEqual(r.acknowledged.receipt);
  expect(r.final).toMatchObject({ roots: r.damaged.head.roots, checkpoint: r.damaged.head.checkpoint,
    owner: 'verified-rescuer', status: 'stopped', generation: r.damaged.head.generation, gameId: r.damaged.head.gameId });
  expect(Reflect.get(r.final.quota, 'privateCapacity')).toEqual(Reflect.get(r.damaged.head.quota, 'privateCapacity'));
  expect(r.final.quota).toMatchObject({ reservedBytes: 0, reservations: 0, usedBytes: r.after.bytes });
  expect(r.final.quota.usedBytes - r.terminal.quota.usedBytes).toBeLessThanOrEqual(r.terminal.allocations['funded-original'].bytes);
  expect(r.after.domain).toBe(r.before.domain); expect(r.replayDump).toEqual(r.after);
});

test('root-only cleanup mutation aborts with empty staged rows/nodes, then original funding still works', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.privateCapacityFixture; await c.seed();
    const damaged = await c.damagePolicy('missing'), injected = await c.rootOnlyCleanupFault(), afterFailure = await c.current();
    let cleaned = false;
    if (injected.result.error && injected.result.before.content === injected.result.after.content) {
      const cancel = c.command(afterFailure, 'operation.cancel', { operationId: 'funded-original' });
      await c.operateCanonical(cancel, 'cancel');
      await c.operateCanonical(c.command(await c.current(), 'operation.acknowledge', {
        operationId: 'funded-original', terminalAttemptId: cancel.attemptId }), 'acknowledge');
      cleaned = true;
    }
    return { damaged, injected, afterFailure, cleaned, final: await c.current(), dump: await c.dump() };
  });
  await info.attach('root-only-cleanup.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(r.injected.calls).toEqual([{ records: 0, nodes: 0, snapshot: false, oldWorld: r.damaged.head.roots.world, nextWorld: null }]);
  expect(r.damaged.head.roots.world).not.toBeNull(); expect(r.injected.result.error).toMatch(/cleanup/);
  expect(r.injected.result.after).toEqual(r.injected.result.before); expect(r.afterFailure).toEqual(r.damaged.head);
  expect(r.cleaned).toBe(true);
  expect(r.final.roots).toEqual(r.damaged.head.roots); expect(r.final.checkpoint).toEqual(r.damaged.head.checkpoint);
  expect(Object.hasOwn(r.final.quota, 'privateCapacity')).toBe(false);
  expect(r.final.quota).toMatchObject({ reservations: 0, reservedBytes: 0, usedBytes: r.dump.bytes });
  expect(r.dump.domain).toBe(r.injected.result.before.domain);
});

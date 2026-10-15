import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

test('claim retained after ACK prepare rejects stale proof once then retries with the current claim without a grant', async ({ page }) => {
  const seeded = await seedRootStop(page, { quota: false });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; c.hold('cleanup:before'); const job = c.begin('ack');
    await c.entered('cleanup:before'); const index = c.hostCalls().length - 1, prepared = c.hostCalls()[index];
    await c.retainRemoteClaim(); const claimed = await c.state(), before = await c.dump(), funding = await c.funding();
    c.release('cleanup:before'); const failed = await c.wait(job), rejected = c.hostCalls()[index];
    const rolledBack = before === await c.dump(), afterFailure = await c.funding();
    const retry = await c.wait(c.begin('ack'));
    return { prepared, claimed, funding, failed, rejected, rolledBack, afterFailure, retry,
      final: await c.state(), root: await c.rootState(), calls: c.calls() };
  });
  expect(result.prepared.input).toMatchObject({ kind: 'verified-ack', proof: { delivery: 'decision-root-stop', decision: { claim: null } } });
  expect(result.claimed.claim).not.toBeNull(); expect(result.claimed.operation.state).toBe('settled');
  expect(result.failed).toMatchObject({ status: 'rejected', error: expect.stringContaining('Canonical cleanup did not confirm') });
  expect(result.rejected.receipt).toBeUndefined(); expect(result.rolledBack).toBe(true); expect(result.afterFailure).toEqual(result.funding);
  expect(result.rejected.failedRequest!.expected.revision).toBe(result.claimed.head.revision);
  expect(result.rejected.failedRequest!.input).toMatchObject({ proof: { decision: { claim: null } } });
  expect(result.afterFailure.head.allocations[result.afterFailure.navigation!.id].bytes).toBeGreaterThan(0);
  expect(result.retry).toMatchObject({ status: 'fulfilled', value: { status: 'navigation-acknowledged' } });
  expect(result.final.acknowledgement!.source.attemptId).not.toBe(result.rejected.failedRequest!.attemptId);
  expect(result.final.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop',
    decision: { claim: result.claimed.claim!.reference, rootAcknowledgement: seeded.root.acknowledgement!.source.attemptId } } });
  expect(result.final.claim).toEqual(result.claimed.claim); expect(result.final.grant).toBeNull();
  expect(result.final.selection).toEqual(seeded.state.selection); expect(result.root.acknowledgement).toEqual(seeded.root.acknowledgement);
  expect(result.calls.some(c => c.method === 'stop-decision')).toBe(false);
});

test('stale ACK revision after an independent canonical commit retries the unchanged proof without a grant', async ({ page }) => {
  const seeded = await seedRootStop(page, { quota: false });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, before = await c.dump(); c.failNext('cleanup');
    const failed = await c.wait(c.begin('ack')), original = c.hostCalls().at(-1)!;
    const rolledBack = before === await c.dump(), funding = await c.funding();
    const advanced = await c.advanceRecoveryRevision(), changed = await c.state(), count = c.calls().length;
    const retry = await c.acknowledge();
    return { failed, original, rolledBack, funding, advanced, changed, retry, cleanup: c.hostCalls().at(-1)!,
      final: await c.state(), root: await c.rootState(), calls: c.calls().slice(count) };
  });
  expect(result.failed.status).toBe('rejected'); expect(result.original.receipt).toBeUndefined();
  expect(result.rolledBack).toBe(true); expect(result.funding.navigation!.state).toBe('settled');
  expect(result.funding.head.allocations[result.funding.navigation!.id].bytes).toBeGreaterThan(0);
  expect(result.original.failedRequest!.expected.revision).toBeLessThan(result.changed.head.revision);
  expect(result.changed.head.revision).toBe(result.advanced.receipt.afterRevision);
  expect(result.original.failedRequest!.input).toMatchObject({ proof: { decision: { claim: null } } });
  expect(result.retry.status).toBe('navigation-acknowledged'); expect(result.cleanup.operation).toBe('cleanup.verified-ack');
  expect(result.final.acknowledgement!.source.attemptId).not.toBe(result.original.failedRequest!.attemptId);
  expect(result.final.acknowledgement!.source.expected).toEqual({ ...result.original.failedRequest!.expected, revision: result.changed.head.revision });
  expect(result.final.acknowledgement!.source.input).toEqual(result.original.failedRequest!.input);
  expect(result.final.claim).toBeNull(); expect(result.final.grant).toBeNull();
  expect(result.final.selection).toEqual(seeded.state.selection); expect(result.root.acknowledgement).toEqual(seeded.root.acknowledgement);
  expect(result.calls.map(c => c.method)).toEqual(['list']);
});

test('claim retained after ACK commit and before reply loss preserves the exact committed no-claim proof on retry', async ({ page }) => {
  const seeded = await seedRootStop(page, { quota: false });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; c.hold('cleanup:after'); c.loseCleanupReply(); const job = c.begin('ack');
    await c.entered('cleanup:after'); const index = c.hostCalls().length - 1, committed = await c.state();
    await c.retainRemoteClaim(); const claimed = await c.state(), before = await c.dump();
    c.release('cleanup:after'); const lost = await c.wait(job), original = c.hostCalls()[index];
    const count = c.calls().length, writes = c.hostCalls().length, retry = await c.acknowledge();
    return { committed, claimed, lost, original, retry, unchanged: before === await c.dump(),
      final: await c.state(), root: await c.rootState(), calls: c.calls().slice(count), writes: c.hostCalls().slice(writes) };
  });
  expect(result.committed.claim).toBeNull(); expect(result.committed.operation.state).toBe('acknowledged');
  expect(result.committed.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop', decision: { claim: null } } });
  expect(result.claimed.claim!.row.revision).toBeGreaterThan(result.committed.acknowledgement!.receipt.afterRevision);
  expect(result.lost.status).toBe('rejected'); expect(result.original.receipt).toBeTruthy();
  expect(result.original.failedRequest).toEqual(result.committed.acknowledgement!.source);
  expect(result.retry.status).toBe('navigation-acknowledged'); expect(result.unchanged).toBe(true);
  expect(result.final.acknowledgement).toEqual(result.committed.acknowledgement);
  expect(result.final.claim).toEqual(result.claimed.claim); expect(result.final.grant).toBeNull();
  expect(result.root.acknowledgement).toEqual(seeded.root.acknowledgement);
  expect(result.calls).toEqual([]); expect(result.writes).toEqual([]);
});

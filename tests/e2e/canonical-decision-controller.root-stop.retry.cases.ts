import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

test('decision-root-stop ACK rolls back physically and retries the exact funded request at quota', async ({ page }) => {
  const seeded = await seedRootStop(page);
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, before = await c.dump(); c.failNext('cleanup');
    const failed = await c.wait(c.begin('ack')), rolledBack = before === await c.dump(), original = c.hostCalls().at(-1)!;
    const funding = await c.funding(), ack = await c.acknowledge();
    return { failed, rolledBack, original, funding, ack, state: await c.state(), root: await c.rootState(), calls: c.hostCalls() };
  });
  expect(result.failed).toMatchObject({ status: 'rejected', error: expect.stringContaining('Canonical cleanup did not confirm') });
  expect(result.rolledBack).toBe(true); expect(result.original.receipt).toBeUndefined();
  expect(result.original.failedRequest!.input).toMatchObject({ proof: { delivery: 'decision-root-stop' } });
  expect(result.funding.navigation!.state).toBe('settled');
  expect(result.funding.head.allocations[result.funding.navigation!.id].bytes).toBeGreaterThan(0);
  expect(result.ack.status).toBe('navigation-acknowledged');
  expect(result.state.acknowledgement!.source).toEqual(result.original.failedRequest);
  expect(result.root.acknowledgement).toEqual(seeded.root.acknowledgement);
  expect(result.calls.at(-1)!.operation).toBe('cleanup.verified-retry');
});

test('committed decision-root-stop ACK survives a lost reply and reload without rewriting source or contacting service', async ({ page }) => {
  await seedRootStop(page);
  const committed = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; c.loseCleanupReply(); const lost = await c.wait(c.begin('ack'));
    const original = c.hostCalls().at(-1)!, state = await c.state(), before = await c.dump(), count = c.calls().length;
    const retry = await c.acknowledge(), unchanged = before === await c.dump(), calls = c.calls().slice(count), snapshot = c.snapshot(); c.stop();
    return { lost, original, state, retry, unchanged, calls, snapshot, bytes: before };
  });
  expect(committed.lost.status).toBe('rejected'); expect(committed.original.receipt).toBeTruthy();
  expect(committed.state.acknowledgement!.source).toEqual(committed.original.failedRequest);
  expect(committed.retry.status).toBe('navigation-acknowledged'); expect(committed.unchanged).toBe(true); expect(committed.calls).toEqual([]);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionController);
  const restored = await page.evaluate(async ({ snapshot, bytes }) => {
    const c = window.canonicalDecisionController; c.restore(snapshot); await c.create();
    const ack = await c.acknowledge(), state = await c.state();
    return { ack, state, unchanged: bytes === await c.dump(), calls: c.calls(), hostCalls: c.hostCalls() };
  }, { snapshot: committed.snapshot, bytes: committed.bytes });
  expect(restored.ack.status).toBe('navigation-acknowledged'); expect(restored.unchanged).toBe(true);
  expect(restored.state.acknowledgement).toEqual(committed.state.acknowledgement);
  expect(restored.calls).toEqual([]); expect(restored.hostCalls).toEqual([]);
  expect(restored.state.claim).toBeNull(); expect(restored.state.grant).toBeNull();
});

test('an earlier decision-handoff ACK remains historical after later verified root Stop without proof replacement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.acknowledge(); const original = await c.state();
    c.settle('continued'); await c.wait(c.begin('cancel')); await c.fillQuota(); await c.acknowledgeRoot(await c.rootEntry());
    const before = await c.dump(), count = c.calls().length, cleanupCount = c.hostCalls().length, ack = await c.acknowledge();
    return { original, ack, state: await c.state(), unchanged: before === await c.dump(),
      calls: c.calls().slice(count), cleanups: c.hostCalls().slice(cleanupCount) };
  });
  expect(result.original.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-handoff' } });
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.unchanged).toBe(true);
  expect(result.state.acknowledgement).toEqual(result.original.acknowledgement);
  expect(result.calls).toEqual([]); expect(result.cleanups).toEqual([]);
});

test('failed handoff ACK cannot reuse its old proof after verified root Stop changes the required delivery', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.fillQuota(); c.failNext('cleanup');
    const failed = await c.wait(c.begin('ack')), original = c.hostCalls().at(-1)!.failedRequest!;
    c.settle('continued'); await c.wait(c.begin('cancel')); await c.acknowledgeRoot(await c.rootEntry());
    const root = await c.rootState(), count = c.calls().length, ack = await c.acknowledge();
    return { failed, original, root, ack, state: await c.state(), calls: c.calls().slice(count), cleanup: c.hostCalls().at(-1)!.operation };
  });
  expect(result.failed.status).toBe('rejected'); expect(result.original.input).toMatchObject({ proof: { delivery: 'decision-handoff' } });
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.cleanup).toBe('cleanup.verified-ack');
  expect(result.state.acknowledgement!.source.attemptId).not.toBe(result.original.attemptId);
  expect(result.state.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop',
    decision: { rootAcknowledgement: result.root.acknowledgement!.source.attemptId } } });
  expect(result.calls.map(c => c.method)).toEqual(['list']);
});

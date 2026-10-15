import { test, expect } from './canonical-decision-controller.test';

test('root ACK fixture uses funded verified cleanup at quota without fabricating navigation discharge', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); const original = await c.state();
    await c.stopRoot(); await c.fillQuota(); const entry = await c.rootEntry(), committed = await c.acknowledgeRoot(entry);
    return { original, entry, committed, root: await c.rootState(), state: await c.state(), calls: c.calls(), hostCalls: c.hostCalls() };
  });
  expect(result.root.launch.guard).toMatchObject({ state: 'acknowledged', ackPolicy: 'verified-host', terminal: { disposition: 'cancelled' } });
  expect(result.root.acknowledgement!.source).toEqual(result.committed.request);
  expect(result.root.acknowledgement!.receipt).toEqual(result.committed.receipt);
  expect(result.root.acknowledgement!.source.input).toMatchObject({ operationId: result.root.launch.guard.id,
    proof: { kind: 'launch-stop', admission: result.root.launch.run!.value.data.admission, terminal: result.entry.terminal } });
  expect(result.root.head.allocations[result.root.launch.guard.id]).toBeUndefined();
  expect(result.state.operation).toEqual(result.original.operation); expect(result.state.acknowledgement).toBeNull();
  expect(result.state.head.allocations[result.state.operation.id]).toEqual(result.original.head.allocations[result.original.operation.id]);
  expect(result.state.head.allocations[result.state.operation.id].bytes).toBeGreaterThan(0);
  expect(result.state.intent).toBeNull(); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  expect(result.hostCalls.map(c => c.operation)).toEqual(['cleanup.cancel', 'cleanup.verified-ack']); expect(result.calls).toEqual([]);
});

test('root ACK fixture retains its exact failed request through quota retry and reload reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.stopRoot(); await c.fillQuota();
    const entry = await c.rootEntry('interrupted'), before = await c.dump(); c.failNext('cleanup');
    const error = await c.acknowledgeRoot(entry).then(() => '', String), rolledBack = before === await c.dump();
    const failed = c.hostCalls().at(-1)!, afterFailure = await c.rootState();
    const committed = await c.acknowledgeRoot(entry, failed.failedRequest), root = await c.rootState();
    const snapshot = c.snapshot(), bytes = await c.dump(); c.stop();
    return { error, rolledBack, failed, afterFailure, committed, root, snapshot, bytes };
  });
  expect(result.error).toContain('Canonical cleanup did not confirm'); expect(result.rolledBack).toBe(true);
  expect(result.failed.receipt).toBeUndefined(); expect(result.afterFailure.launch.guard.state).toBe('settled');
  expect(result.afterFailure.acknowledgement).toBeNull();
  expect(result.committed.request).toEqual(result.failed.failedRequest);
  expect(result.root.acknowledgement!.source).toEqual(result.failed.failedRequest);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionController);
  const restored = await page.evaluate(async ({ snapshot, bytes }) => {
    const c = window.canonicalDecisionController; c.restore(snapshot); const root = await c.rootState(), state = await c.state();
    return { root, state, unchanged: bytes === await c.dump(), calls: c.calls(), hostCalls: c.hostCalls() };
  }, { snapshot: result.snapshot, bytes: result.bytes });
  expect(restored.root).toEqual(result.root); expect(restored.unchanged).toBe(true);
  expect(restored.state.operation.state).toBe('settled'); expect(restored.state.acknowledgement).toBeNull();
  expect(restored.calls).toEqual([]); expect(restored.hostCalls).toEqual([]);
});

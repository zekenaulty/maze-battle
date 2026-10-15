import { test, expect } from './canonical-decision-controller.test';

test('physical ACK failure before commit cannot reuse pre-Stop evidence after local Stop', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.fillQuota(); const before = await c.dump();
    c.failNext('cleanup'); const failed = await c.wait(c.begin('ack')), rolledBack = before === await c.dump();
    const afterFailure = await c.state(), firstAck = c.hostCalls().at(-1)!;
    await c.wait(c.begin('cancel')); const afterStop = await c.state(), afterStopBytes = await c.dump(), callCount = c.calls().length;
    c.configure({ unavailable: true }); const unknown = await c.wait(c.begin('ack'));
    const unknownUnchanged = afterStopBytes === await c.dump(), unknownCalls = c.calls().slice(callCount);
    c.configure({ unavailable: false }); const ack = await c.acknowledge();
    return { failed, rolledBack, afterFailure, firstAck, afterStop, unknown, unknownUnchanged, unknownCalls, ack,
      final: await c.state(), calls: c.calls().slice(callCount), hostCalls: c.hostCalls(), remote: c.remote() };
  });
  expect(result.failed).toMatchObject({ status: 'rejected', error: expect.stringContaining('Canonical cleanup did not confirm') });
  expect(result.rolledBack).toBe(true); expect(result.firstAck.receipt).toBeUndefined();
  expect(result.firstAck.failedRequest!.input).toMatchObject({ proof: { remote: { stopped: false, state: 'waking' } } });
  expect(result.afterFailure.operation.state).toBe('settled'); expect(result.afterFailure.acknowledgement).toBeNull();
  expect(result.afterStop.launch.guard.terminal?.disposition).toBe('cancelled'); expect(result.afterStop.operation.state).toBe('settled');
  expect(result.unknown).toMatchObject({ status: 'rejected', error: expect.stringContaining('missing or ambiguous decision service custody') });
  expect(result.unknownUnchanged).toBe(true); expect(result.unknownCalls.map(c => c.method)).toEqual(['list']);
  expect(result.calls.map(c => c.method)).toEqual(['list', 'list', 'stop-decision']);
  expect(result.calls.at(-1)!.input).toEqual(result.final.intent!.data.event);
  expect(result.calls.at(-1)!.observed).toMatchObject({ guard: { terminal: { disposition: 'cancelled' } }, operation: { state: 'settled' } });
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.final.operation.state).toBe('acknowledged');
  const cleanups = result.hostCalls.filter(c => c.operation.startsWith('cleanup.'));
  expect(cleanups.map(c => c.operation)).toEqual(['cleanup.verified-ack', 'cleanup.cancel', 'cleanup.verified-ack']);
  expect(result.final.acknowledgement!.source.attemptId).not.toBe(result.firstAck.failedRequest!.attemptId);
  expect(result.final.acknowledgement!.source.input).toMatchObject({ proof: { remote: { stopped: true, state: 'cancelled' } } });
  expect(result.final.claim).toEqual(result.afterFailure.claim); expect(result.final.grant).toBeNull();
  expect(result.remote.entry.stopDecision).toEqual(result.final.intent!.data.event); expect(result.remote.activations).toBe(1);
});

test('lost ACK reply after native commit preserves the exact historical ACK while reconciling later Stop', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
    await c.pulse(); await c.pulse(); await c.fillQuota(); c.loseCleanupReply();
    const lost = await c.wait(c.begin('ack')), committed = await c.state(), firstAck = c.hostCalls().at(-1)!;
    await c.wait(c.begin('cancel')); const callsBefore = c.calls().length, afterStopBytes = await c.dump();
    const ack = await c.acknowledge(), unchanged = afterStopBytes === await c.dump(), final = await c.state();
    return { lost, committed, firstAck, ack, unchanged, final, calls: c.calls().slice(callsBefore), hostCalls: c.hostCalls(), remote: c.remote() };
  });
  expect(result.lost.status).toBe('rejected'); expect(result.firstAck.receipt).toBeTruthy();
  expect(result.committed.operation.state).toBe('acknowledged');
  expect(result.committed.acknowledgement!.source).toEqual(result.firstAck.failedRequest);
  expect(result.committed.acknowledgement!.source.input).toMatchObject({ proof: { remote: { stopped: false, state: 'waking' } } });
  expect(result.calls.map(c => c.method)).toEqual(['list', 'stop-decision']);
  expect(result.calls.at(-1)!.input).toEqual(result.final.intent!.data.event);
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.unchanged).toBe(true);
  expect(result.final.operation).toEqual(result.committed.operation);
  expect(result.final.acknowledgement).toEqual(result.committed.acknowledgement);
  expect(result.hostCalls.filter(c => c.operation.startsWith('cleanup.')).map(c => c.operation))
    .toEqual(['cleanup.verified-ack', 'cleanup.cancel']);
  expect(result.remote.entry).toMatchObject({ state: 'cancelled', stopDecision: result.final.intent!.data.event });
  expect(result.remote.activations).toBe(1);
});

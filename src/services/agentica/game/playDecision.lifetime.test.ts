// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { m, run, attach, navigate, drain, hold, options, sdk, scope, host, update, onDecision, fail, pulse, driverClose,
  successorAction, result } from './playDecision.test-support';
import { deferred } from './transportGate';

describe('decision runner cancellation and bounded scheduling', () => {
  it('is inert for an already aborted caller', async () => {
    scope.abort(); const runner = run(); runner.close(); await drain();
    expect(m.state).not.toHaveBeenCalled(); expect(m.publication).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it.each(['state', 'publication', 'prepare', 'connect', 'wake', 'ack'])('caller abort overtakes pending %s', async stage => {
    const barrier = hold(({ state: m.state, publication: m.publication, prepare: m.prepare, connect: sdk.connect, wake: sdk.wakeOperation, ack: m.ack }[stage]!));
    run(); await vi.advanceTimersByTimeAsync(500); await barrier.entered;
    scope.abort(); const updates = update.mock.calls.length;
    if (stage !== 'state') expect(sdk.close).toHaveBeenCalledOnce();
    expect(host.signal.aborted).toBe(false); expect(m.cleanup).not.toHaveBeenCalled();
    barrier.release(); await vi.advanceTimersByTimeAsync(30_000);
    expect(update).toHaveBeenCalledTimes(updates); if (stage !== 'ack') expect(m.grant).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
    if (stage === 'state') { expect(sdk.connect).not.toHaveBeenCalled(); expect(m.publication).not.toHaveBeenCalled(); }
  });
  it.each(['abort', 'close', 'host'])('%s fences a late action result without replacing it', async reason => {
    const runner = await attach(), barrier = hold(m.action), delivery = options.onAction(successorAction); await barrier.entered;
    if (reason === 'abort') scope.abort(); else if (reason === 'close') runner.close(); else host.abort();
    barrier.release(); await expect(delivery).resolves.toBe(result);
    expect(m.driver).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it.each(['abort', 'close', 'host'])('%s closes a late driver without stale updates', async reason => {
    const runner = await attach(), barrier = hold(m.driver), delivery = options.onAction(successorAction); await barrier.entered;
    if (reason === 'abort') scope.abort(); else if (reason === 'close') runner.close(); else host.abort();
    const updates = update.mock.calls.length; barrier.release(); await expect(delivery).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledTimes(updates);
    expect(m.cleanup).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it('close is synchronous, idempotent and only releases local resources', async () => {
    const runner = await navigate(); runner.close(); runner.close();
    expect(sdk.close).toHaveBeenCalledOnce(); expect(driverClose).toHaveBeenCalled(); expect(host.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); expect(pulse).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  });
  it('serializes decision pulses and closes a hung attachment at fifteen seconds', async () => {
    const barrier = hold(m.remote); run(); await vi.advanceTimersByTimeAsync(250); await barrier.entered;
    await vi.advanceTimersByTimeAsync(14_749); expect(m.remote).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(fail).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce();
    barrier.release(); await vi.advanceTimersByTimeAsync(30_000);
    expect(m.remote).toHaveBeenCalledOnce(); expect(sdk.wakeOperation).not.toHaveBeenCalled(); expect(m.grant).not.toHaveBeenCalled();
  });
  it('bounds an endless prefix sequence without silently starting a new intention', async () => {
    m.prefix.mockResolvedValue(1); run(); await vi.advanceTimersByTimeAsync(15_000);
    expect(fail).toHaveBeenCalledOnce(); expect(m.remote.mock.calls.length).toBeLessThanOrEqual(60);
    const calls = m.remote.mock.calls.length; await vi.advanceTimersByTimeAsync(30_000);
    expect(m.remote).toHaveBeenCalledTimes(calls); expect(m.prepare).toHaveBeenCalledOnce(); expect(sdk.wakeOperation).not.toHaveBeenCalled();
  });
  it('discards an old navigation decision arriving after close', async () => {
    const runner = await navigate(), pending = deferred<unknown>(); pulse.mockReturnValue(pending.promise);
    await vi.advanceTimersByTimeAsync(250); runner.close(); const updates = update.mock.calls.length;
    pending.resolve({ status: 'decision-required' }); await vi.advanceTimersByTimeAsync(30_000);
    expect(update).toHaveBeenCalledTimes(updates); expect(onDecision).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it('holds successor navigation behind predecessor ACK, preserving the admitted result on Stop', async () => {
    const barrier = hold(m.ack); run(); await vi.advanceTimersByTimeAsync(500); await barrier.entered;
    const delivery = options.onAction(successorAction); await drain(); expect(m.action).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled();
    scope.abort(); await expect(delivery).resolves.toBe(result); barrier.release(); await vi.advanceTimersByTimeAsync(30_000);
    expect(m.ack).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
  });
});

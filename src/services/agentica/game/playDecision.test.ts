// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { m, run, attach, navigate, drain, hold, notice, options, sdk, session, update, onDecision, fail, pulse, driverClose,
  original, successorAction, successorBinding, result, view } from './playDecision.test-support';
import { deferred } from './transportGate';

describe('explicit mounted decision continuation', () => {
  it('publishes and prepares once, attaches before execution, then returns the exact next original without another wake', async () => {
    const barrier = hold(sdk.wakeOperation); run(); await vi.advanceTimersByTimeAsync(250); await barrier.entered;
    const action = structuredClone(successorAction), executing = options.onAction(action);
    await drain(); expect(m.action).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled();
    barrier.release(); await drain(); await vi.advanceTimersByTimeAsync(250);
    await expect(executing).resolves.toBe(result);
    expect(m.publication).toHaveBeenCalledOnce(); expect(m.prepare).toHaveBeenCalledExactlyOnceWith(successorBinding.publication);
    expect(m.hooks.mock.calls[0][1]).toEqual(successorBinding);
    expect(m.driver).toHaveBeenCalledExactlyOnceWith(session, sdk, successorAction, successorBinding);
    expect(sdk.connect).toHaveBeenCalledOnce(); expect(sdk.wakeOperation).toHaveBeenCalledOnce(); expect(sdk.adoptDecision).not.toHaveBeenCalled();
    action.arguments.row = 999;
    expect(m.ack).toHaveBeenCalledOnce(); expect(m.ack.mock.invocationCallOrder[0]).toBeGreaterThan(m.grant.mock.invocationCallOrder[0]);
    m.boundary({ phase: 'decision', message: 'Navigation reached a decision boundary.', canContinue: true });
    expect(onDecision).toHaveBeenCalledExactlyOnceWith({ action: successorAction, binding: successorBinding });
    const reads = m.state.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.state).toHaveBeenCalledTimes(reads); expect(sdk.wakeOperation).toHaveBeenCalledOnce();
    expect(driverClose).toHaveBeenCalled(); expect(sdk.close).toHaveBeenCalledOnce(); expect(m.cleanup).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled(); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'decision' }));
  });

  it('stops decision polling once attached and does not navigate for a non-operation result', async () => {
    m.action.mockResolvedValue({ ...result, operation: undefined }); await attach();
    const reads = m.state.mock.calls.length; await options.onAction(successorAction); await vi.advanceTimersByTimeAsync(30_000);
    expect(m.state).toHaveBeenCalledTimes(reads); expect(m.driver).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'running' }));
  });

  it('only schedules after the real action hook resolves and coalesces exact replay during driver construction', async () => {
    await attach(); const actionBarrier = hold(m.action), delivery = options.onAction(successorAction);
    await actionBarrier.entered; expect(m.driver).not.toHaveBeenCalled();
    const driverBarrier = hold(m.driver); actionBarrier.release(); await driverBarrier.entered;
    await expect(options.onAction(structuredClone(successorAction))).resolves.toBe(result);
    expect(m.driver).toHaveBeenCalledOnce(); driverBarrier.release(); await expect(delivery).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(250); expect(pulse).toHaveBeenCalledOnce();
  });

  it('refuses a second original but preserves its already committed result', async () => {
    await navigate(); await expect(options.onAction({ ...successorAction, actionId: 'second' })).resolves.toBe(result);
    expect(m.driver).toHaveBeenCalledOnce(); expect(driverClose).toHaveBeenCalled(); expect(fail).toHaveBeenCalledOnce();
  });

  it.each(['publish', 'prepare', 'wake', 'driver'])('%s failure reports recovery, never retries or cleans up automatically', async stage => {
    const failure = new Error('Unavailable');
    ({ publish: m.publication, prepare: m.prepare, wake: sdk.wakeOperation, driver: m.driver }[stage]!).mockRejectedValueOnce(failure);
    await attach();
    if (stage === 'driver') await expect(options.onAction(successorAction)).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(30_000); expect(fail).toHaveBeenCalledExactlyOnceWith(failure);
    expect(m.cleanup).not.toHaveBeenCalled(); expect(sdk.stopDecision).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
  });

  it.each(['owner', 'epoch', 'adoption'])('refuses foreign %s before publication or connecting', async kind => {
    if (kind === 'owner') view.value.terminal.bound.launch.guard.owner = 'foreign';
    if (kind === 'epoch') view.head.epoch = 2;
    if (kind === 'adoption') view.value.decision = { data: { adoption: {} } };
    run(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(m.publication).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('refuses an adoption discovered after preparation without calling adoptDecision', async () => {
    const prepare = m.prepare.getMockImplementation()!;
    m.prepare.mockImplementation(async () => { await prepare(); view.value.decision.data.adoption = {}; });
    run(); await drain(); expect(fail).toHaveBeenCalledOnce(); expect(sdk.adoptDecision).not.toHaveBeenCalled(); expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('captures caller input before pending construction', async () => {
    const input = structuredClone(original), barrier = hold(m.state); run({ original: input }); await barrier.entered;
    input.action.arguments.row = 999; input.binding.grant.id = 'changed'; barrier.release(); await vi.advanceTimersByTimeAsync(500);
    expect(m.state.mock.calls[0][0].action).toEqual(original.action); expect(m.state.mock.calls[0][1]).toEqual(original.binding);
  });

  it('throwing display callbacks cannot alter an admitted action result', async () => {
    update.mockImplementation(() => { throw Error('Display'); }); await attach();
    await expect(options.onAction(successorAction)).resolves.toBe(result); expect(fail).not.toHaveBeenCalled();
  });

  it.each([false, undefined])('preserves terminal status but never offers a next original when canContinue is %s', async canContinue => {
    await navigate(); const status = { phase: 'decision', message: 'Navigation settled. Objective completion is not established.', canContinue };
    m.boundary(status); expect(update).toHaveBeenLastCalledWith({ ...status, canContinue: false });
    expect(fail).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled(); expect(driverClose).toHaveBeenCalled();
  });

  it('a failed predecessor ACK closes without starting navigation or retrying settlement', async () => {
    m.ack.mockRejectedValueOnce(new Error('ACK unknown')); run(); await vi.advanceTimersByTimeAsync(30_000);
    expect(fail).toHaveBeenCalledOnce(); expect(m.ack).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled();
    expect(m.cleanup).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
  });

  it('waits for exact predecessor ACK even if the admitted successor has already parked', async () => {
    const barrier = hold(m.ack); run(); await vi.advanceTimersByTimeAsync(500); await barrier.entered;
    const delivery = options.onAction(successorAction); await drain(); notice('outcome');
    expect(m.driver).not.toHaveBeenCalled(); expect(sdk.close).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    barrier.release(); await expect(delivery).resolves.toBe(result); await vi.advanceTimersByTimeAsync(250);
    expect(m.ack).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce(); expect(pulse).toHaveBeenCalledOnce();
  });

  it('uncertain ACK preserves an already committed action result without releasing navigation', async () => {
    const ack = deferred<unknown>(); m.ack.mockReturnValue(ack.promise); run(); await vi.advanceTimersByTimeAsync(500);
    expect(m.ack).toHaveBeenCalledOnce();
    const delivery = options.onAction(successorAction); await drain();
    // A real service/transaction error is not an instruction to retry or fabricate release.
    ack.reject(new Error('Unknown ACK')); await expect(delivery).resolves.toBe(result); await vi.advanceTimersByTimeAsync(30_000);
    expect(m.ack).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled(); expect(fail).toHaveBeenCalledOnce();
  });
});

describe('matched successor channel withdrawal', () => {
  it.each(['outcome', 'cancel.requested', 'cancelled', 'run.terminated'])('ignores foreign %s', async type => {
    await navigate(); notice(type, 'foreign-run'); await vi.advanceTimersByTimeAsync(250);
    expect(pulse).toHaveBeenCalledOnce(); expect(driverClose).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it.each(['cancel.requested', 'cancelled', 'run.terminated'])('matching %s closes navigation and requires recovery', async type => {
    await navigate(); notice(type); await vi.advanceTimersByTimeAsync(30_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(fail).toHaveBeenCalledOnce(); expect(m.cleanup).not.toHaveBeenCalled();
  });
  it.each(['disconnected', 'connection.error', 'protocol.error', 'action.error'])('%s is not a parked outcome', async state => {
    await navigate(); options.onStatus?.({ state }); await vi.advanceTimersByTimeAsync(30_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(fail).toHaveBeenCalledOnce();
  });
  it('permits an admitted operation to outlive its matched outcome, including a pending driver', async () => {
    await attach(); const barrier = hold(m.driver), delivery = options.onAction(successorAction); await barrier.entered;
    notice('outcome'); expect(sdk.close).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
    barrier.release(); await expect(delivery).resolves.toBe(result); await vi.advanceTimersByTimeAsync(250);
    expect(pulse).toHaveBeenCalledOnce(); expect(driverClose).not.toHaveBeenCalled();
    await expect(options.onAction(successorAction)).rejects.toThrow(); expect(m.action).toHaveBeenCalledOnce();
  });
  it('outcome without canonical navigation requires recovery, not fabricated completion', async () => {
    await attach(); notice('operation.parked'); notice('outcome');
    expect(fail).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
  });
  it('retains pre-accept terminal reasons without misclassifying them as a later outcome', async () => {
    const barrier = hold(sdk.wakeOperation); run(); await vi.advanceTimersByTimeAsync(250); await barrier.entered;
    notice('run.terminated'); notice('outcome'); expect(fail).not.toHaveBeenCalled();
    barrier.release(); await drain(); expect(String(fail.mock.calls[0][0])).toContain('run.terminated');
    expect(m.grant).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled();
  });
});

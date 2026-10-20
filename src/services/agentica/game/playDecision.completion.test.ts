// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { m, run, attach, drain, hold, notice, options, sdk, scope, host, update, onDecision, fail,
  successorAction, result, start } from './playDecision.test-support';
import { deferred } from './transportGate';
import { actionFingerprint, actionKey, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import { completionSdk, completionStore } from './playCompletion.test-support';
import { protocolResult } from '../../../persistence/canonical/agentica/types.test-support';

const completed = { ...result, operation: undefined,
  completion: { objectiveId: start.objectiveId, evidenceId: 'host-proof', summary: 'Host return proof satisfied.' } };

describe('successor host completion after predecessor handoff', () => {
  it.each([{}, { status: 'failed' }, { status: 'succeeded', reason: 'complete' }])(
    'preserves completion custody without interpreting outcome %j as acknowledgement', async payload => {
    m.action.mockResolvedValue(completed); await attach();
    await expect(options.onAction(successorAction)).resolves.toBe(completed);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    expect(m.ack).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled(); expect(sdk.close).not.toHaveBeenCalled();
    expect(m.cleanup).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    options.onMessage?.({ protocolVersion: 1, type: 'outcome', runId: successorAction.runId, payload });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied',
      message: 'Host objective satisfied; Agentica outcome received. Retained cleanup still requires Stop.' }));
    expect(fail).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
    const changes = update.mock.calls.length; await vi.advanceTimersByTimeAsync(30_000);
    expect(update).toHaveBeenCalledTimes(changes); expect(sdk.wakeOperation).toHaveBeenCalledOnce();
  });

  it('retains local proof and an open reply channel after a post-hook SDK result failure', async () => {
    m.action.mockResolvedValue(completed); const runner = await attach();
    await expect(options.onAction(successorAction)).resolves.toBe(completed);
    options.onStatus?.({ state: 'action.error', detail: 'Post-hook storage read failed.' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false,
      message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(fail).not.toHaveBeenCalled(); expect(sdk.close).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
    notice('outcome');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Service delivery is unconfirmed') }));
    runner.close(); expect(sdk.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])('holds completion behind predecessor ACK, including early outcome=%s', async earlyOutcome => {
    m.action.mockResolvedValue(completed);
    const barrier = hold(m.ack); run(); await vi.advanceTimersByTimeAsync(500); await barrier.entered;
    const delivery = options.onAction(successorAction); let replied = false; void delivery.then(() => { replied = true; });
    await drain(); if (earlyOutcome) notice('outcome');
    expect(replied).toBe(false); expect(update.mock.calls.some(([s]) => s.phase === 'satisfied')).toBe(false);
    expect(sdk.close).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    const before = update.mock.calls.length;
    barrier.release(); await expect(delivery).resolves.toBe(completed); await drain();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    expect(update.mock.calls.slice(before).some(([s]) => s.phase === 'running')).toBe(false);
    expect(sdk.close).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled();
  });

  it('uncertain predecessor ACK cannot satisfy or replace the committed result', async () => {
    m.action.mockResolvedValue(completed);
    const ack = deferred<unknown>(); m.ack.mockReturnValueOnce(ack.promise);
    run(); await vi.advanceTimersByTimeAsync(500);
    const delivery = options.onAction(successorAction); await drain(); ack.reject(Error('Unknown ACK'));
    await expect(delivery).resolves.toBe(completed);
    expect(update.mock.calls.some(([s]) => s.phase === 'satisfied')).toBe(false);
    expect(fail).toHaveBeenCalledOnce(); expect(m.ack).toHaveBeenCalledOnce(); expect(m.cleanup).not.toHaveBeenCalled();
  });

  it.each(['stop', 'close', 'takeover'])('fences pending completion behind ACK on %s', async reason => {
    m.action.mockResolvedValue(completed);
    const barrier = hold(m.ack), runner = run(); await vi.advanceTimersByTimeAsync(500); await barrier.entered;
    const delivery = options.onAction(successorAction); await drain();
    if (reason === 'stop') scope.abort(); else if (reason === 'close') runner.close(); else host.abort();
    const changes = update.mock.calls.length;
    await expect(delivery).resolves.toBe(completed); barrier.release(); await drain();
    expect(update).toHaveBeenCalledTimes(changes); expect(update.mock.calls.some(([s]) => s.phase === 'satisfied')).toBe(false);
    expect(m.cleanup).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });

  it.each(['stop', 'close', 'takeover'])('fences a late canonical completion on %s', async reason => {
    m.action.mockResolvedValue(completed);
    const runner = await attach(), barrier = hold(m.action), delivery = options.onAction(successorAction); await barrier.entered;
    if (reason === 'stop') scope.abort(); else if (reason === 'close') runner.close(); else host.abort();
    const changes = update.mock.calls.length; barrier.release(); await expect(delivery).resolves.toBe(completed);
    expect(update).toHaveBeenCalledTimes(changes); expect(update.mock.calls.some(([s]) => s.phase === 'satisfied')).toBe(false);
  });

  it('does not manufacture completion from a remote outcome', async () => {
    await attach();
    options.onMessage?.({ protocolVersion: 1, type: 'outcome', runId: successorAction.runId,
      payload: { completion: completed.completion } });
    expect(fail).toHaveBeenCalledOnce(); expect(update.mock.calls.some(([s]) => s.phase === 'satisfied')).toBe(false);
    expect(m.action).not.toHaveBeenCalled(); expect(onDecision).not.toHaveBeenCalled();
  });
});

describe('successor completion through the real SDK', () => {
  async function setup() {
    const inspection = { ...successorAction, capabilityId: 'maze.inspect', arguments: { scope: 'objective' },
      deadlineAt: new Date(Date.now() + 60_000).toISOString() };
    const completed = { ...protocolResult(inspection),
      completion: { objectiveId: start.objectiveId, evidenceId: 'host-proof', summary: 'Satisfied locally.' } };
    const store = completionStore(inspection, completed);
    m.load.mockImplementation(store.load); m.save.mockImplementation(store.save);
    m.action.mockImplementation(store.execute); m.reconcile.mockImplementation(store.reconcile);
    let wire!: ReturnType<typeof completionSdk>, hooks!: AgenticaHostOptions;
    const runner = run({ factory: options => {
      hooks = options; wire = completionSdk(options, inspection, start.objectiveId);
      wire.sdk.wakeOperation = sdk.wakeOperation; return wire.sdk;
    } });
    await vi.advanceTimersByTimeAsync(500);
    const extra = { ...successorAction, actionId: 'fresh-after-completion', deadlineAt: inspection.deadlineAt };
    return { inspection, completed, extra, store, wire, hooks, runner };
  }
  it('seals before predecessor ACK while preserving the delayed SDK reply and exact replay', async () => {
    const barrier = hold(m.ack), f = await setup(); await barrier.entered;
    const delivery = f.wire.deliver(f.inspection); await drain();
    expect(m.action).toHaveBeenCalledOnce(); expect(f.wire.frames).toHaveLength(0);
    expect(update.mock.calls.some(([state]) => state.phase === 'satisfied')).toBe(false);
    await expect(f.hooks.saveAction(actionKey(f.extra), { fingerprint: actionFingerprint(f.extra), status: 'pending' })).rejects.toThrow('sealed');
    const extraDelivery = f.wire.deliver(f.extra); barrier.release(); await delivery; await extraDelivery;
    expect(f.wire.frames.map(frame => frame.payload.disposition)).toEqual(['applied', 'unresolved']);
    expect(f.wire.frames[0].payload).toEqual(f.completed); expect(f.wire.close).not.toHaveBeenCalled();
    expect(m.save).toHaveBeenCalledOnce(); expect(m.action).toHaveBeenCalledOnce();
    expect(f.store.records.has(actionKey(f.extra))).toBe(false); expect(f.store.effect).not.toHaveBeenCalled();
    expect(m.driver).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
    await expect(f.hooks.onAction(f.extra)).rejects.toThrow('sealed fresh action execution');
    await expect(f.hooks.onAction({ ...f.inspection, arguments: { scope: 'cell' } })).rejects.toThrow('sealed');
    const record = f.store.records.get(actionKey(f.inspection))!;
    await expect(f.hooks.saveAction(actionKey(f.inspection), record)).resolves.toBeUndefined();
    await expect(f.hooks.reconcileAction!(f.inspection, record)).resolves.toEqual(f.completed);
    await f.wire.deliver(f.inspection, 'action.reconcile');
    expect(f.wire.frames.at(-1)!.payload).toEqual(f.completed); expect(m.action).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    expect(fail).not.toHaveBeenCalled(); f.runner.close(); expect(f.wire.close).toHaveBeenCalledOnce();
  });
  it('signals a real SDK delivery failure without closing the reply channel or discarding local proof', async () => {
    const f = await setup(); let failed = false;
    m.load.mockImplementation(async key => {
      if (!failed && f.store.records.get(key)?.status === 'completed') { failed = true; throw Error('Storage read failed'); }
      return f.store.load(key);
    });
    await f.wire.deliver(f.inspection);
    expect(f.wire.frames[0].payload.disposition).toBe('unresolved');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false,
      message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(f.wire.close).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    await f.wire.deliver(f.inspection); expect(f.wire.frames.at(-1)!.payload).toEqual(f.completed);
    f.wire.notice('outcome', { status: 'failed' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(m.action).toHaveBeenCalledOnce(); expect(m.cleanup).not.toHaveBeenCalled();
  });
  it('also seals when the SDK loads and replays an already committed completion', async () => {
    const f = await setup();
    f.store.records.set(actionKey(f.inspection), { fingerprint: actionFingerprint(f.inspection), status: 'completed', result: f.completed });
    await f.wire.deliver(f.inspection);
    expect(f.wire.frames[0].payload).toEqual(f.completed);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    await expect(f.hooks.onAction(f.extra)).rejects.toThrow('sealed');
    await f.wire.deliver(f.extra);
    expect(m.save).not.toHaveBeenCalled(); expect(m.action).not.toHaveBeenCalled(); expect(f.store.effect).not.toHaveBeenCalled();
  });
  it('holds a verified retained completion behind ACK and notifies satisfaction only once', async () => {
    const barrier = hold(m.ack), f = await setup(); await barrier.entered;
    f.store.records.set(actionKey(f.inspection), { fingerprint: actionFingerprint(f.inspection), status: 'completed', result: f.completed });
    const delivery = f.wire.deliver(f.inspection); await drain();
    expect(f.wire.frames).toHaveLength(0); expect(f.wire.close).not.toHaveBeenCalled();
    expect(update.mock.calls.some(([state]) => state.phase === 'satisfied')).toBe(false);
    await expect(f.hooks.saveAction(actionKey(f.extra), { fingerprint: actionFingerprint(f.extra), status: 'pending' })).rejects.toThrow('sealed');
    const before = update.mock.calls.length; barrier.release(); await delivery; await drain();
    expect(f.wire.frames[0].payload).toEqual(f.completed); expect(m.ack).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    expect(update.mock.calls.slice(before).some(([state]) => state.phase === 'running')).toBe(false);
    f.hooks.onStatus?.({ state: 'action.error', detail: 'Delivery is unconfirmed' });
    const updates = update.mock.calls.length;
    await f.wire.deliver(f.inspection, 'action.reconcile');
    expect(update).toHaveBeenCalledTimes(updates);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(f.wire.close).not.toHaveBeenCalled(); expect(m.action).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
    expect(m.driver).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  });
  it.each(['stop', 'takeover'])('retains historical replay after %s interrupts its ACK wait', async kind => {
    const barrier = hold(m.ack), f = await setup(); await barrier.entered;
    const record = { fingerprint: actionFingerprint(f.inspection), status: 'completed' as const, result: f.completed };
    f.store.records.set(actionKey(f.inspection), record);
    const delivery = f.wire.deliver(f.inspection); await drain();
    expect(f.wire.frames).toHaveLength(0);
    if (kind === 'stop') scope.abort(); else host.abort();
    const updates = update.mock.calls.length; await delivery;
    await expect(f.hooks.saveAction(actionKey(f.inspection), record)).resolves.toBeUndefined();
    await f.wire.deliver(f.inspection, 'action.reconcile');
    barrier.release(); await drain();
    expect(update).toHaveBeenCalledTimes(updates); expect(f.wire.frames).toHaveLength(0);
    expect(update.mock.calls.some(([state]) => state.phase === 'satisfied')).toBe(false);
    expect(m.action).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it.each(['disconnect', 'protocol failure'])('marks %s before reply as unconfirmed without losing local proof', async failure => {
    const f = await setup(), entered = deferred<void>(), release = deferred<void>(); let held = false;
    m.load.mockImplementation(async key => {
      const record = await f.store.load(key);
      if (!held && record?.status === 'completed') { held = true; entered.resolve(); await release.promise; }
      return record;
    });
    const delivery = f.wire.deliver(f.inspection); await entered.promise;
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied' }));
    expect(f.wire.frames).toHaveLength(0);
    if (failure === 'disconnect') f.wire.close(); else f.wire.protocolError();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false,
      message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(fail).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
    release.resolve(); await delivery;
    if (failure === 'disconnect') expect(f.wire.frames).toHaveLength(0);
    else expect(f.wire.frames[0].payload).toEqual(f.completed);
    await f.hooks.saveAction(actionKey(f.inspection), f.store.records.get(actionKey(f.inspection))!);
    f.wire.notice('outcome', { status: 'succeeded', reason: 'complete' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Service delivery is unconfirmed') }));
    expect(m.driver).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  });
  it.each(['stop', 'takeover'])('ignores late SDK completion/error on %s while preserving completed persistence', async kind => {
    const f = await setup(), barrier = hold(m.action), delivery = f.wire.deliver(f.inspection); await barrier.entered;
    if (kind === 'stop') scope.abort(); else host.abort();
    const updates = update.mock.calls.length; barrier.release(); await delivery;
    f.hooks.onStatus?.({ state: 'action.error', detail: 'Late failure' }); f.wire.notice('outcome', { status: 'failed' });
    expect(update).toHaveBeenCalledTimes(updates); expect(update.mock.calls.some(([state]) => state.phase === 'satisfied')).toBe(false);
    await expect(f.hooks.saveAction(actionKey(f.inspection), f.store.records.get(actionKey(f.inspection))!)).resolves.toBeUndefined();
    await f.wire.deliver(f.extra);
    expect(m.save).toHaveBeenCalledOnce(); expect(m.action).toHaveBeenCalledOnce(); expect(f.store.effect).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  });
});

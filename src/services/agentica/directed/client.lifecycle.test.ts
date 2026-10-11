// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../clientPolicy';
import { lifecycleFixture, LifecycleSocket } from './lifecycle.testSupport';
import * as actions from '../../../persistence/directedAgentica/actions';
import * as runs from '../../../persistence/directedAgentica/runs';
import * as stream from '../../../persistence/streamRepository';
import * as travel from '../../../persistence/directedStreamRepository';
import * as events from '../../../persistence/directedAgentica/events';

let f: ReturnType<typeof lifecycleFixture>;
beforeEach(() => { vi.resetAllMocks(); f = lifecycleFixture(); });
afterEach(async () => { await f.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('directed launch lifecycle through the real SDK', () => {
  it('preserves fixture defaults and clones explicit provider/limit options', async () => {
    await f.client().start();
    expect(f.request().provider).toEqual({ provider: 'fixture', model: 'fixture-model', contextWindowTokens: 131072, maxOutputTokens: 4096 });
    expect(f.request().limits).toEqual({ maxSteps: 16, maxRefinements: 8, maxPlanContinuations: 8, timeoutSeconds: 300, actionTimeoutSeconds: 45 });
    const provider = { provider: 'fixture' as const, model: 'chosen', contextWindowTokens: 32768, maxOutputTokens: 2048 };
    const limits = { maxSteps: 3, maxRefinements: 2, maxPlanContinuations: 1, timeoutSeconds: 20, actionTimeoutSeconds: 5 };
    const host = f.client({ provider, limits }); provider.model = 'changed'; limits.maxSteps = 999;
    await host.start(); expect(f.request().provider.model).toBe('chosen'); expect(f.request().limits.maxSteps).toBe(3);
  });

  it.each([
    ['planInvalid', 'planInvalid', 'failed'], ['failed', 'toolFailure', 'failed'],
    ['blocked', 'stepLimitReached', 'blocked'], ['blocked', 'refinementLimitReached', 'blocked'],
    ['blocked', 'continuationLimitReached', 'blocked'], ['cancelled', 'timeout', 'cancelled'],
    ['cancelled', 'cancelled', 'cancelled'], ['partiallyComplete', 'partial', 'blocked'],
    ['succeeded', 'complete', 'blocked'],
  ])('settles no-admission %s/%s without waiting for a journey', async (status, stopReason, expected) => {
    const host = f.client(); await host.start();
    f.socket().receive('outcome', { outcome: { runId: 'runner-id-not-service-id', status, stopReason }, truncated: true }, { runId: 'service-run' });
    expect(host.status).toBe(expected); expect(await host.tick()).toBeUndefined(); expect(host.status).toBe(expected);
    f.socket().receive('status', { status: 'running' }, { runId: 'service-run' });
    f.socket().receive('action.request', f.action(), { runId: 'service-run' });
    await vi.waitFor(() => expect(f.socket().sent.some(item => item.type === 'action.result')).toBe(true));
    expect(actions.executeDirectedAgenticaAction).not.toHaveBeenCalled(); expect(host.status).toBe(expected);
  });

  it('retains early setup termination across delayed binding, without requiring an outcome', async () => {
    const entered = deferred<void>(), gate = deferred<void>();
    const bind = vi.mocked(runs.bindDirectedAgenticaRun).getMockImplementation()!;
    vi.mocked(runs.bindDirectedAgenticaRun).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return bind(...args); });
    const host = f.client(); const pending = host.start(); await entered.promise;
    f.socket().receive('run.terminated', { status: 'failed', code: 'run.failed', message: 'Setup failed', exceptionType: 'ArgumentException' }, { runId: 'service-run' });
    expect(host.status).toBe('failed'); gate.resolve(); await pending;
    expect(host.status).toBe('failed'); expect(host.currentRun?.runId).toBe('service-run');
    expect(await host.tick()).toBeUndefined();
  });

  it('ignores foreign run terminal/status messages and makes terminal status sticky', async () => {
    const host = f.client(); await host.start();
    for (const runId of ['old-run', undefined]) {
      f.socket().receive('run.terminated', { status: 'failed' }, { runId });
      f.socket().receive('outcome', { outcome: { status: 'cancelled' } }, { runId });
      f.socket().receive('status', { status: 'failed' }, { runId });
    }
    expect(host.status).toBe('starting');
    f.socket().receive('outcome', { outcome: { status: 'blocked', stopReason: 'stepLimitReached' } }, { runId: 'service-run' });
    f.socket().receive('outcome', { outcome: { status: 'succeeded' } }, { runId: 'service-run' });
    expect(host.status).toBe('blocked');
  });

  it('keeps parked partial execution eligible for provider-free host travel', async () => {
    const host = f.client(); await host.start(); f.park(host);
    f.socket().receive('outcome', { outcome: { status: 'partiallyComplete', stopReason: 'partial' } }, { runId: 'service-run' });
    expect(host.status).toBe('parked'); await host.tick(); expect(host.status).toBe('parked');
    expect(travel.prepareDurableDirectedStreamMove).toHaveBeenCalledTimes(1);
    expect(f.socket().sent.filter(item => item.type === 'start')).toHaveLength(1);
  });

  it('does not regress confirmed arrival on a delayed parked replay', async () => {
    const host = f.client(); await host.start(); const entry = f.park(host);
    f.state.record!.state.operation.status = 'arrived';
    const event = await events.stageDirectedHostEvent('test', 'journey');
    vi.mocked(events.stageDirectedHostEvent).mockResolvedValue({ ...event, kind: 'completed',
      completion: { objectiveId: host.currentRun!.objectiveId, evidenceId: 'arrival', summary: 'Arrived' } });
    await host.tick(); expect(host.status).toBe('completed');
    f.socket().receive('operation.parked', entry, { runId: 'service-run' });
    f.socket().receive('outcome', { outcome: { status: 'partiallyComplete', stopReason: 'partial' } }, { runId: 'service-run' });
    expect(host.status).toBe('completed');
  });

  it.each(['pending', 'failed', 'succeeded'])('preserves %s inspection wake state across binding and old-run messages', async outcome => {
    const host = f.client({ inspectOnArrival: true }); await host.start(); f.park(host);
    f.state.record!.state.operation.status = 'arrived';
    const event = await events.stageDirectedHostEvent('test', 'journey');
    vi.mocked(events.stageDirectedHostEvent).mockResolvedValue({ ...event, kind: 'decision' });
    LifecycleSocket.onSend = (request, socket) => {
      if (request.type !== 'operation.wake') throw new Error('Unexpected dispatch');
      socket.reply(request, 'started', f.started(f.request(), 'wake-run'), 'wake-run');
      socket.receive('run.terminated', { status: 'failed' }, { runId: 'service-run' });
      if (outcome !== 'pending') socket.receive('outcome', { outcome: { status: outcome } }, { runId: 'wake-run' });
    };
    await host.tick();
    expect(host.currentRun?.runId).toBe('wake-run');
    expect(host.status).toBe(outcome === 'pending' ? 'awaiting-inspection' : outcome === 'succeeded' ? 'completed' : 'failed');
  });

  it('reports a rejected budget wake without acknowledging or replacing the decision', async () => {
    const host = f.client({ inspectOnArrival: true }); await host.start(); f.park(host);
    f.state.record!.state.operation.status = 'arrived';
    const event = await events.stageDirectedHostEvent('test', 'journey');
    vi.mocked(events.stageDirectedHostEvent).mockResolvedValue({ ...event, kind: 'decision' });
    LifecycleSocket.onSend = (request, socket) => socket.reply(request, 'error', { code: 'operation.budget', message: 'Budget exhausted' });
    await expect(host.tick()).rejects.toThrow('Budget exhausted'); expect(host.status).toBe('blocked');
    expect(events.acknowledgeDirectedHostEvent).not.toHaveBeenCalled();
    expect(f.socket().sent.filter(item => item.type === 'operation.wake')).toHaveLength(1);
  });

  it('replays the same bound wake after a failed local event acknowledgement', async () => {
    const host = f.client({ inspectOnArrival: true }); await host.start(); f.park(host);
    f.state.record!.state.operation.status = 'arrived';
    const event = { ...await events.stageDirectedHostEvent('test', 'journey'), kind: 'decision' as const };
    vi.mocked(events.stageDirectedHostEvent).mockResolvedValue(event);
    vi.mocked(events.acknowledgeDirectedHostEvent).mockRejectedValueOnce(new Error('Local acknowledgement failed'));
    LifecycleSocket.onSend = (request, socket) => {
      expect(request.type).toBe('operation.wake'); expect(request.payload).toEqual(event);
      socket.reply(request, 'started', f.started(f.request(), 'wake-run'), 'wake-run');
      socket.receive('outcome', { outcome: { status: 'succeeded', stopReason: 'complete' } }, { runId: 'wake-run' });
    };
    await expect(host.tick()).rejects.toThrow('Local acknowledgement failed');
    expect(host.currentRun?.runId).toBe('wake-run');
    await host.tick(); expect(host.currentRun?.runId).toBe('wake-run'); expect(host.status).toBe('completed');
    expect([...f.retainedRuns.keys()]).toEqual(['service-run', 'wake-run']);
    expect(f.socket().sent.filter(item => item.type === 'start')).toHaveLength(1);
  });

  it('reports connectivity separately and does not overwrite a terminal outcome', async () => {
    const onStatus = vi.fn(); const host = f.client({ onStatus }); await host.start();
    expect(onStatus).toHaveBeenCalledWith({ state: 'connected', detail: undefined });
    f.socket().receive('outcome', { outcome: { status: 'blocked' } }, { runId: 'service-run' });
    f.socket().close(); expect(host.connected).toBe(false); expect(host.status).toBe('blocked');
    expect(onStatus).toHaveBeenLastCalledWith({ state: 'disconnected', detail: undefined });
  });

  it('does not turn a disconnected parked journey into a terminal failure', async () => {
    const host = f.client({ onStatus: () => { throw new Error('Observer failed'); } }); await host.start(); f.park(host);
    f.socket().close(); expect(host.status).toBe('parked'); await host.tick(); expect(host.status).toBe('parked');
  });

  it('settles rejected start and refuses replacement starts on the same client', async () => {
    LifecycleSocket.onSend = (request, socket) => socket.reply(request, 'error', { code: 'session.busy', message: 'Busy' });
    const host = f.client(); await expect(host.start()).rejects.toThrow('Busy'); expect(host.status).toBe('failed');
    await expect(host.start()).rejects.toThrow('reconciliation');
    expect(f.socket().sent.filter(item => item.type === 'start')).toHaveLength(1);
  });

  it('treats lost start acknowledgement as unresolved without reconnect or retry', async () => {
    LifecycleSocket.onSend = (_request, socket) => socket.close();
    const host = f.client(); await expect(host.start()).rejects.toThrow('unresolved'); expect(host.status).toBe('unresolved');
    expect(host.unresolvedStart).toBe(true);
    expect(LifecycleSocket.instances).toHaveLength(1); expect(f.socket().sent).toHaveLength(1);
  });

  it('cancels during ownership acquisition without dispatching start', async () => {
    const entered = deferred<void>(), gate = deferred<void>();
    const open = vi.mocked(travel.openDirectedStreamSession).getMockImplementation()!;
    vi.mocked(travel.openDirectedStreamSession).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return open(...args); });
    const host = f.client(); const start = host.start(); const rejected = expect(start).rejects.toThrow('cancelled'); await entered.promise;
    const cancelling = host.cancel(); gate.resolve(); await cancelling; await rejected;
    expect(host.status).toBe('cancelled'); expect(f.state.control.epoch).toBe(12); expect(LifecycleSocket.instances).toHaveLength(0);
  });

  it('stops a late announced start exactly once after cancellation, without binding or effects', async () => {
    const entered = deferred<void>(); let reply!: () => void; const send = LifecycleSocket.onSend!;
    LifecycleSocket.onSend = (request, socket) => {
      if (request.type === 'start') { reply = () => send(request, socket); entered.resolve(); } else send(request, socket);
    };
    const host = f.client(); const start = host.start(); const rejected = expect(start).rejects.toThrow('cancelled'); await entered.promise;
    await host.cancel(); reply(); await rejected; await host.cancel(); reply();
    expect(f.socket().sent.filter(item => item.type === 'cancel')).toHaveLength(1);
    expect(runs.bindDirectedAgenticaRun).not.toHaveBeenCalled(); expect(actions.executeDirectedAgenticaAction).not.toHaveBeenCalled();
    expect(host.status).toBe('cancelled'); expect(f.state.control.epoch).toBe(12);
    expect(host.unresolvedCancellation).toBe(false);
  });

  it('fences queued actions when cancellation races a persisted binding acknowledgement', async () => {
    const entered = deferred<void>(), gate = deferred<void>();
    const bind = vi.mocked(runs.bindDirectedAgenticaRun).getMockImplementation()!;
    vi.mocked(runs.bindDirectedAgenticaRun).mockImplementation(async (...args) => { await bind(...args); entered.resolve(); await gate.promise; });
    const host = f.client(); const start = host.start(); const rejected = expect(start).rejects.toThrow('cancelled'); await entered.promise;
    f.socket().receive('action.request', f.action(), { runId: 'service-run' });
    await host.cancel(); gate.resolve(); await rejected;
    await vi.waitFor(() => expect(f.socket().sent.some(item => item.type === 'action.result')).toBe(true));
    expect(actions.executeDirectedAgenticaAction).not.toHaveBeenCalled(); expect(host.status).toBe('cancelled');
    expect(f.socket().sent.filter(item => item.type === 'cancel')).toHaveLength(1);
    expect(stream.claimStreamControl).toHaveBeenCalledTimes(1);
  });

  it('stops a run whose binding failed without replacing the original start', async () => {
    vi.mocked(runs.bindDirectedAgenticaRun).mockRejectedValue(new Error('Storage unavailable'));
    const host = f.client(); await expect(host.start()).rejects.toThrow('Storage unavailable');
    expect(host.status).toBe('unresolved'); expect(host.currentRun).toBeUndefined();
    expect(f.socket().sent.filter(item => item.type === 'cancel')).toHaveLength(1);
    expect(actions.executeDirectedAgenticaAction).not.toHaveBeenCalled();
  });

  it('does not repeat a failed original cancellation request', async () => {
    const host = f.client(); await host.start();
    LifecycleSocket.onSend = (request, socket) => socket.reply(request, 'error', { code: 'storage.unavailable', message: 'Unresolved' });
    await expect(host.cancel()).rejects.toThrow('Unresolved'); await expect(host.cancel()).rejects.toThrow('Unresolved');
    expect(host.unresolvedCancellation).toBe(true);
    expect(host.status).toBe('cancelled'); expect(f.socket().sent.filter(item => item.type === 'cancel')).toHaveLength(1);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { m, run, attach, drain, hold, notice, options, sdk, scope, host, update, onDecision, fail,
  successorAction, result, start } from './playDecision.test-support';
import { deferred } from './transportGate';

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
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'satisfied', canContinue: false }));
    expect(fail).not.toHaveBeenCalled(); expect(sdk.close).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
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

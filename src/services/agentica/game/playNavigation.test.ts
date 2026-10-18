import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import type { AgenticaAction } from '../contracts';
import type { ActionBinding } from './actionContract';
import type { OperationSdk } from './operationTerminal';
import { startPlayNavigation } from './playNavigation';

const driver = vi.hoisted(() => ({ pulse: vi.fn(), close: vi.fn() }));
vi.mock('./operationDriver', () => ({ createGameOperationDriver: vi.fn(async () => driver) }));
const session = {} as GameSession, sdk = {} as OperationSdk, action = {} as AgenticaAction, binding = {} as ActionBinding;

describe('bounded App navigation scheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());
  it('serializes pulses and stops at a decision without scheduling a successor', async () => {
    driver.pulse.mockResolvedValueOnce({ status: 'advanced', sequence: 1 }).mockResolvedValueOnce({ status: 'decision-required' });
    const update = vi.fn(), fail = vi.fn();
    await startPlayNavigation(session, sdk, action, binding, new AbortController().signal, update, fail);
    await vi.advanceTimersByTimeAsync(500);
    expect(update.mock.calls.map(([state]) => state.phase)).toEqual(['navigating', 'decision']);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(driver.pulse).toHaveBeenCalledTimes(2); expect(driver.close).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
  });
  it('does not overlap an unresolved pulse or reschedule a late response after withdrawal', async () => {
    let resolve!: (value: unknown) => void;
    driver.pulse.mockImplementation(() => new Promise(done => { resolve = done; }));
    const signal = new AbortController(), update = vi.fn();
    await startPlayNavigation(session, sdk, action, binding, signal.signal, update, vi.fn());
    await vi.advanceTimersByTimeAsync(30_000); expect(driver.pulse).toHaveBeenCalledOnce();
    signal.abort(); resolve({ status: 'advanced', sequence: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(driver.pulse).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled(); expect(driver.close).toHaveBeenCalledOnce();
  });
  it('bounds absent service custody to fifteen seconds and never silently retries failures', async () => {
    driver.pulse.mockResolvedValue({ status: 'awaiting-service' });
    const fail = vi.fn();
    await startPlayNavigation(session, sdk, action, binding, new AbortController().signal, vi.fn(), fail);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fail).toHaveBeenCalledOnce(); expect(String(fail.mock.calls[0][0])).toContain('custody is unavailable');
    const calls = driver.pulse.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000); expect(driver.pulse).toHaveBeenCalledTimes(calls);
  });
  it('closes a driver constructed after its authority was withdrawn', async () => {
    const signal = new AbortController(); signal.abort();
    await expect(startPlayNavigation(session, sdk, action, binding, signal.signal, vi.fn(), vi.fn())).rejects.toThrow();
    expect(driver.close).toHaveBeenCalledOnce(); expect(driver.pulse).not.toHaveBeenCalled();
  });
});

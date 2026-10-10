import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimStreamControl, executeStreamAction } from '../persistence/streamRepository';
import { gate, reviewRepository } from '../services/expedition/streamRuntime.review.testSupport';
import { useStreamExpedition } from './useStreamExpedition';

vi.mock('../persistence/streamRepository', () => ({
  createStreamSlot: vi.fn(), claimStreamControl: vi.fn(), executeStreamAction: vi.fn(),
  loadStreamAction: vi.fn(), loadStreamControl: vi.fn(), loadStreamSnapshot: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(async () => { cleanup(); await Promise.resolve(); vi.useRealTimers(); });

async function mounted() {
  const repository = reviewRepository();
  const hook = renderHook(() => useStreamExpedition());
  await waitFor(() => expect(hook.result.current.runtime).toBeDefined());
  return { ...hook, repository };
}

describe('stream hook control race review', () => {
  it('lets the latest of three rapid queued keys survive without cascading takeovers', async () => {
    const { result, repository } = await mounted();
    const entered = gate();
    const release = gate();
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return claim(...args);
    });
    await act(async () => {
      const first = result.current.dispatch({ type: 'move', direction: 'east' }, true);
      await entered.promise;
      const second = result.current.dispatch({ type: 'move', direction: 'east' }, true);
      const latest = result.current.dispatch({ type: 'move', direction: 'south' }, true);
      release.resolve();
      await Promise.all([first, second, latest]);
    });
    expect(repository.snapshot.checkpoint.position).toMatchObject({ row: 1, column: 0 });
    expect(repository.snapshot.checkpoint.moves).toBe(1);
    expect(claimStreamControl).toHaveBeenCalledTimes(4); // Initial claim plus three input intents.
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeUndefined();
    expect(result.current.message).toBe('Moved.');
  });

  it('does not let an old refusal stop a restarted autoplay intent', async () => {
    const { result } = await mounted();
    const entered = gate();
    const release = gate();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return execute(...args);
    });
    vi.useFakeTimers();
    await act(async () => {
      const old = result.current.dispatch({ type: 'move', direction: 'north' });
      await entered.promise;
      result.current.stop();
      result.current.toggle();
      release.resolve();
      await old;
    });
    expect(result.current.playing).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.message).toBe('Checkpoint loaded.');
    expect(claimStreamControl).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    expect(executeStreamAction).toHaveBeenCalledTimes(2);
    expect(result.current.view!.checkpoint.position).toMatchObject({ row: 0, column: 1 });
  });

  it('stops resumed autoplay if takeover rejects before its next timer fires', async () => {
    const { result } = await mounted();
    const entered = gate();
    const release = gate();
    vi.mocked(claimStreamControl).mockImplementationOnce(async () => {
      entered.resolve(); await release.promise; throw new Error('Control ownership changed.');
    });
    vi.useFakeTimers();
    await act(async () => {
      result.current.stop();
      await entered.promise;
      result.current.toggle();
    });
    expect(result.current.playing).toBe(true);
    await act(async () => { release.resolve(); });
    expect(result.current.error).toMatch(/Control ownership changed/);
    expect(result.current.runtime!.faulted).toBe(true);
    expect(result.current.playing).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(executeStreamAction).not.toHaveBeenCalled();
  });

  it('survives two autoplay timers queued during stop/start and a delayed takeover', async () => {
    const { result } = await mounted();
    const moving = gate();
    const releaseMove = gate();
    const claiming = gate();
    const releaseClaim = gate();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      moving.resolve(); await releaseMove.promise; return execute(...args);
    });
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
      claiming.resolve(); await releaseClaim.promise; return claim(...args);
    });
    vi.useFakeTimers();
    act(() => { result.current.toggle(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(160); await moving.promise; });
    act(() => { result.current.stop(); });
    act(() => { result.current.toggle(); });
    // First resumed timer waits for the active move and takeover.
    await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    await act(async () => { releaseMove.resolve(); await claiming.promise; });
    // Publishing the move schedules another timer while the claim still waits.
    await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    await act(async () => { releaseClaim.resolve(); });
    expect(executeStreamAction).toHaveBeenCalledTimes(2);
    expect(result.current.view!.checkpoint.collectedChests).toBe(1);
    expect(result.current.error).toBeUndefined();
    expect(result.current.playing).toBe(true);
    expect(claimStreamControl).toHaveBeenCalledTimes(2);
  });

  it('keeps an unmounted action outcome from affecting a replacement hook runtime', async () => {
    const old = await mounted();
    const entered = gate();
    const release = gate();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return execute(...args);
    });
    const pending = old.result.current.dispatch({ type: 'move', direction: 'east' });
    await entered.promise;
    old.unmount();
    const replacement = renderHook(() => useStreamExpedition());
    await waitFor(() => expect(replacement.result.current.runtime).toBeDefined());
    await act(async () => { release.resolve(); await pending; });
    expect(replacement.result.current.error).toBeUndefined();
    expect(replacement.result.current.message).toBe('Checkpoint loaded.');
    expect(replacement.result.current.view!.checkpoint.revision).toBe(0);
    expect(old.repository.snapshot.checkpoint.revision).toBe(0);
  });
});

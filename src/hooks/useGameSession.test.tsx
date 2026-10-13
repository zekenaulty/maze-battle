import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSessionView } from '../services/game/GameSession';
import { exploreView } from '../components/ExploreScreen.test-support';
import { useGameSession } from './useGameSession';

const mocks = vi.hoisted(() => {
  const state = { ready: undefined as GameSessionView | undefined, refreshed: undefined as GameSessionView | undefined };
  class Session {
    view: GameSessionView = { saves: [], diagnostics: [], status: 'Loading', controlled: false };
    readonly changed: (view: GameSessionView) => void;
    constructor(changed: Session['changed']) { this.changed = changed; instances.push(this); }
    publish(view: GameSessionView) { this.view = view; this.changed(view); }
    start = vi.fn(async () => { this.publish(state.ready!); });
    stop = vi.fn(() => { this.publish({ ...this.view, controlled: false, status: 'Paused' }); });
    refresh = vi.fn(async () => { if (state.refreshed) this.publish(state.refreshed); });
    flush = vi.fn(async () => {});
    createManualSave = vi.fn(async () => {});
    loadSave = vi.fn(async (_id: string) => {});
    removeSave = vi.fn(async (_id: string) => {});
    refreshSaves = vi.fn(async () => {});
    takeControl = vi.fn(async () => { this.publish(state.ready!); });
    resetGame = vi.fn(async () => { this.publish(state.ready!); });
  }
  const instances: Session[] = [];
  return { state, Session, instances };
});
vi.mock('../services/game/GameSession', () => ({ GameSession: mocks.Session }));
beforeEach(() => {
  vi.useFakeTimers(); mocks.instances.length = 0;
  mocks.state.ready = { game: { ...exploreView(), autoThrottleMs: 500, randomBattles: false }, saves: [], diagnostics: [], status: 'Ready', controlled: true };
  mocks.state.refreshed = undefined;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const settled = () => act(async () => {});
const pageEvent = (name: string, persisted: boolean) => { const event = new Event(name); Object.defineProperty(event, 'persisted', { value: persisted }); return event; };

describe('canonical session React lifecycle', () => {
  it('publishes the canonical snapshot with its game and exposes only the new session contract', async () => {
    const { result, rerender, unmount } = renderHook(useGameSession); await settled();
    const controller = mocks.instances[0];
    expect(result.current.game).toBe(mocks.state.ready!.game);
    expect(result.current.game?.snapshot).toBe(mocks.state.ready!.game!.snapshot);
    expect(result.current.controlled).toBe(true); expect(result.current.controller).toBe(controller);
    expect(result.current).not.toHaveProperty('transition'); expect(result.current).not.toHaveProperty('observationHead');
    for (let i = 0; i < 5; i++) rerender();
    expect(mocks.instances).toHaveLength(1); expect(controller.start).toHaveBeenCalledOnce(); unmount();
  });

  it('refreshes on the bounded timer and focus, and removes both triggers on unmount', async () => {
    const { unmount } = renderHook(useGameSession); await settled(); const controller = mocks.instances[0];
    await act(() => vi.advanceTimersByTimeAsync(749)); expect(controller.refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1)); expect(controller.refresh).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(new Event('focus'))); expect(controller.refresh).toHaveBeenCalledTimes(2);
    unmount(); expect(controller.stop).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(3000)); window.dispatchEvent(new Event('focus'));
    expect(controller.refresh).toHaveBeenCalledTimes(2);
  });

  it('adopts refreshed canonical view and custody together without a second storage read', async () => {
    const { result, unmount } = renderHook(useGameSession); await settled();
    const old = mocks.state.ready!, game = { ...old.game!, snapshot: { ...old.game!.snapshot, revision: 17,
      roots: { ...old.game!.snapshot.roots, knowledge: 'remote-knowledge' } } };
    mocks.state.refreshed = { ...old, game, controlled: false, status: 'Read only: another tab controls this game.' };
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(result.current.game).toBe(game); expect(result.current.controlled).toBe(false);
    expect(result.current.game?.snapshot.revision).toBe(17); expect(mocks.instances[0].start).toHaveBeenCalledOnce(); unmount();
  });

  it('stops on pagehide and restarts only for a persisted pageshow', async () => {
    const { result, unmount } = renderHook(useGameSession); await settled(); const controller = mocks.instances[0];
    act(() => window.dispatchEvent(pageEvent('pagehide', true)));
    expect(controller.stop).toHaveBeenCalledOnce(); expect(result.current.controlled).toBe(false);
    await act(async () => window.dispatchEvent(pageEvent('pageshow', false))); expect(controller.start).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(pageEvent('pageshow', true))); expect(controller.start).toHaveBeenCalledTimes(2);
    expect(result.current.controlled).toBe(true); unmount();
    window.dispatchEvent(pageEvent('pageshow', true)); expect(controller.start).toHaveBeenCalledTimes(2);
  });

  it('retains published startup errors rather than replacing them with generic loading or auto-reset', async () => {
    const error = new Error('Canonical database blocked');
    const start = vi.spyOn(mocks.Session.prototype, 'publish');
    const original = mocks.state.ready!;
    mocks.state.ready = { ...original, game: undefined, controlled: false, recoveryRequired: true, busy: false, status: `Action failed: ${error.message}` };
    const { result, unmount } = renderHook(useGameSession); await settled(); const controller = mocks.instances[0];
    controller.start.mockImplementationOnce(async () => { controller.publish(mocks.state.ready!); throw error; });
    await act(async () => window.dispatchEvent(pageEvent('pageshow', true)));
    expect(result.current.status).toBe('Action failed: Canonical database blocked'); expect(result.current.recoveryRequired).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.status).toBe('Action failed: Canonical database blocked'); expect(controller.resetGame).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalled(); unmount();
  });

  it('delegates exact save identities and recovery methods to the same controller', async () => {
    const { result, unmount } = renderHook(useGameSession); await settled(); const controller = mocks.instances[0];
    await act(() => result.current.loadSave('manual-receipt-id'));
    await act(() => result.current.removeSave('other-receipt-id'));
    await act(() => result.current.createManualSave()); await act(() => result.current.refreshSaves());
    await act(() => result.current.flush()); await act(() => result.current.takeControl()); await act(() => result.current.resetGame());
    expect(controller.loadSave).toHaveBeenCalledExactlyOnceWith('manual-receipt-id');
    expect(controller.removeSave).toHaveBeenCalledExactlyOnceWith('other-receipt-id');
    for (const method of ['createManualSave', 'refreshSaves', 'flush', 'takeControl', 'resetGame'] as const)
      expect(controller[method]).toHaveBeenCalledOnce();
    unmount();
  });

  it('balances StrictMode start/stop and leaves no refresh timer after cleanup', async () => {
    const { unmount } = renderHook(useGameSession, { wrapper: StrictMode }); await settled();
    const controller = mocks.instances.find(instance => instance.start.mock.calls.length)!;
    expect(mocks.instances.filter(instance => instance.start.mock.calls.length)).toHaveLength(1);
    expect(controller.start).toHaveBeenCalledTimes(2); expect(controller.stop).toHaveBeenCalledOnce();
    unmount(); expect(controller.stop).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(3000)); expect(controller.refresh).not.toHaveBeenCalled();
  });
});

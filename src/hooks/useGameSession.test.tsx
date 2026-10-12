import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../domain/gameFactory';
import { createPlayTelemetry } from '../domain/telemetry/transitions';
import { SaveOwnershipError } from '../persistence/saveControl';
import { useGameSession } from './useGameSession';

const storage = vi.hoisted(() => ({
  claimGame: vi.fn(), readGameControl: vi.fn(), updateOwnedGame: vi.fn(), changeOwnedSave: vi.fn(),
  loadOwnedGame: vi.fn(), replaceOwnedGame: vi.fn(),
  getGame: vi.fn(), listSaves: vi.fn(), loadTelemetry: vi.fn(), saveTelemetry: vi.fn(),
}));
vi.mock('../persistence/gameCustody', () => storage);
vi.mock('../persistence/saveRepository', () => storage);
vi.mock('../persistence/telemetryRepository', () => storage);
vi.mock('../persistence/legacyLocalStorage', () => ({ importLegacyLocalStorageSaves: async () => ({ imported: 0, warnings: [] }) }));

beforeEach(() => {
  vi.resetAllMocks();
  const game = createNewGameState();
  storage.claimGame.mockImplementation(async owner => ({ game, control: { owner, epoch: 1, revision: 1 } }));
  storage.readGameControl.mockResolvedValue({});
  storage.updateOwnedGame.mockImplementation(async (control, update) => ({ game: update(game), control: { ...control, revision: control.revision + 1 } }));
  storage.listSaves.mockResolvedValue([]);
  storage.saveTelemetry.mockResolvedValue(undefined);
  storage.loadTelemetry.mockResolvedValue(undefined);
  storage.changeOwnedSave.mockImplementation(async control => ({ ...control, revision: control.revision + 1 }));
});

describe('game session persistence', () => {
  it.each(['claimed-head', undefined])('publishes the initial claim with its exact head: %s', async observationHead => {
    const game = createNewGameState();
    storage.claimGame.mockImplementation(async owner => ({ game, observationHead, control: { owner, epoch: 1, revision: 1 } }));
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    expect(result.current.game).toBe(game);
    expect(result.current.observationHead).toBe(observationHead);
    unmount();
  });

  it('publishes each manual transition with its returned head, including clearing a previous head', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    for (const observationHead of ['transition-head', undefined]) {
      const game = { ...result.current.game!, mode: observationHead ? 'manual' as const : 'town' as const };
      storage.updateOwnedGame.mockImplementationOnce(async control => ({ game, observationHead,
        control: { ...control, revision: control.revision + 1 } }));
      act(() => result.current.transition(() => game, { source: 'manual', action: 'test' }));
      await act(() => result.current.flush());
      expect(result.current.game).toBe(game);
      expect(result.current.observationHead).toBe(observationHead);
    }
    unmount();
  });

  it('refreshes game and head together, then adopts the takeover head', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    const control = { owner: 'other-tab', epoch: 2, revision: 2 };
    for (const observationHead of ['refreshed-head', undefined]) {
      const game = createNewGameState();
      control.revision++;
      storage.readGameControl.mockResolvedValue({ game, observationHead, control: { ...control } });
      await act(() => result.current.controller.refresh());
      expect(result.current.game).toBe(game);
      expect(result.current.observationHead).toBe(observationHead);
      expect(result.current.controlled).toBe(false);
    }
    const game = createNewGameState();
    storage.claimGame.mockImplementationOnce(async owner => ({ game, observationHead: 'takeover-head',
      control: { owner, epoch: 3, revision: 5 } }));
    await act(() => result.current.takeControl());
    expect(result.current.game).toBe(game);
    expect(result.current.observationHead).toBe('takeover-head');
    expect(result.current.controlled).toBe(true);
    unmount();
  });

  it('adopts load and replacement heads from custody, never a separate slot read or the previous view', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    storage.getGame.mockResolvedValue({ label: 'Manual', observationHead: 'stale-separate-read' });
    for (const observationHead of ['loaded-head', undefined]) {
      const game = createNewGameState();
      storage.loadOwnedGame.mockImplementationOnce(async control => ({ game, observationHead,
        control: { ...control, revision: control.revision + 1 } }));
      await act(() => result.current.loadSave('manual'));
      expect(result.current.game).toBe(game);
      expect(result.current.observationHead).toBe(observationHead);
    }
    for (const observationHead of ['replacement-head', undefined]) {
      const game = createNewGameState();
      storage.replaceOwnedGame.mockImplementationOnce(async control => ({ game, observationHead,
        control: { ...control, revision: control.revision + 1 } }));
      await act(() => result.current.replaceGame(game));
      expect(result.current.game).toBe(game);
      expect(result.current.observationHead).toBe(observationHead);
    }
    unmount();
  });

  it('preserves existing diagnostics when their read fails, without preventing game saves', async () => {
    storage.loadTelemetry.mockRejectedValue(new Error('temporary read failure'));
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    act(() => result.current.transition(g => ({ ...g, randomBattles: false }), { source: 'manual', action: 'test' }));
    await act(() => result.current.flush());
    expect(storage.updateOwnedGame).toHaveBeenCalled();
    expect(storage.saveTelemetry).not.toHaveBeenCalled();
    expect(result.current.status).toContain('diagnostics storage unavailable');
    unmount();
  });

  it('reports storage failure and requires recovery instead of continuing autonomous writes', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    storage.changeOwnedSave.mockRejectedValueOnce(new Error('quota reached'));
    await act(async () => { await expect(result.current.createManualSave()).rejects.toThrow('quota reached'); });
    expect(result.current.status).toContain('Save failed');
    expect(result.current.controlled).toBe(false);
    await act(() => result.current.takeControl());
    await act(() => result.current.createManualSave());
    expect(result.current.status).toBe('Manual save created');
    unmount();
  });

  it('serializes accepted actions with advancing revision tokens and persists diagnostics', async () => {
    let game = createNewGameState();
    storage.claimGame.mockImplementation(async owner => ({ game, control: { owner, epoch: 1, revision: 1 } }));
    storage.updateOwnedGame.mockImplementation(async (control, update) => {
      game = update(game);
      return { game, control: { ...control, revision: control.revision + 1 } };
    });
    const trace = createPlayTelemetry(game.id);
    trace.counters.goldGained = 10;
    storage.loadTelemetry.mockResolvedValue(trace);
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    act(() => {
      for (let i = 0; i < 3; i++) result.current.transition(state => ({ ...state, inventory: { ...state.inventory, gold: state.inventory.gold + 1 } }), { source: 'manual', action: 'test' });
    });
    await act(() => result.current.flush());
    expect(result.current.telemetry?.counters.goldGained).toBe(13);
    expect(storage.updateOwnedGame.mock.calls.map(call => call[0].revision)).toEqual([1, 2, 3]);
    expect(storage.saveTelemetry.mock.lastCall?.[0].sequence).toBe(3);
    expect(storage.saveTelemetry.mock.lastCall?.[1].revision).toBe(4);
    unmount();
  });

  it('does not publish or retry a rejected stale transition with fresh authority', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    const before = result.current.game;
    storage.updateOwnedGame.mockRejectedValueOnce(new SaveOwnershipError());
    act(() => result.current.transition(g => ({ ...g, dungeonLevel: 99 }), { source: 'auto', action: 'auto-step' }));
    await act(() => result.current.flush());
    expect(result.current.game).toBe(before);
    expect(result.current.controlled).toBe(false);
    expect(storage.saveTelemetry).not.toHaveBeenCalled();
    await act(() => result.current.takeControl());
    expect(storage.updateOwnedGame).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('bounds pending auto ticks so manual control is not delayed behind a timer backlog', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.controlled).toBe(true));
    let release!: () => void;
    const stalled = new Promise<void>(resolve => { release = resolve; });
    storage.updateOwnedGame.mockImplementationOnce(async (control, update) => {
      await stalled;
      return { game: update(createNewGameState()), control: { ...control, revision: control.revision + 1 } };
    });
    const actions: string[] = [];
    act(() => {
      for (let i = 0; i < 100; i++) result.current.transition(g => { actions.push('auto'); return g; }, { source: 'auto', action: 'auto-step' });
      result.current.transition(g => { actions.push('stop'); return g; }, { source: 'manual', action: 'stop' });
    });
    await act(async () => { release(); await result.current.flush(); });
    expect(actions).toEqual(['auto', 'stop']);
    expect(storage.updateOwnedGame).toHaveBeenCalledTimes(2);
    act(() => result.current.transition(g => { actions.push('resumed'); return g; }, { source: 'auto', action: 'auto-step' }));
    await act(() => result.current.flush());
    expect(actions).toEqual(['auto', 'stop', 'resumed']);
    unmount();
  });

  it('opens a secondary controller as read only and rejects manual saves', async () => {
    storage.claimGame.mockResolvedValue({ game: createNewGameState(), control: { owner: 'other-tab', epoch: 7, revision: 12 } });
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.game).toBeDefined());
    expect(result.current.controlled).toBe(false);
    await act(async () => { await expect(result.current.createManualSave()).rejects.toThrow('Another tab'); });
    expect(storage.changeOwnedSave).not.toHaveBeenCalled();
    unmount();
  });
});

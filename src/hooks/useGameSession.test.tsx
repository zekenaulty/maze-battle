import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../domain/gameFactory';
import { createPlayTelemetry } from '../domain/telemetry/transitions';
import { useGameSession } from './useGameSession';

const storage = vi.hoisted(() => ({
  saveGame: vi.fn(), getGame: vi.fn(), listSaves: vi.fn(), deleteSave: vi.fn(),
  loadTelemetry: vi.fn(), saveTelemetry: vi.fn(),
}));
vi.mock('../persistence/saveRepository', () => storage);
vi.mock('../persistence/telemetryRepository', () => storage);
vi.mock('../persistence/legacyLocalStorage', () => ({ importLegacyLocalStorageSaves: async () => 0 }));

beforeEach(() => {
  vi.resetAllMocks();
  storage.getGame.mockResolvedValue({ game: createNewGameState() });
  storage.listSaves.mockResolvedValue([]);
  storage.saveGame.mockResolvedValue(undefined);
  storage.saveTelemetry.mockResolvedValue(undefined);
  storage.loadTelemetry.mockResolvedValue(undefined);
});

describe('game session persistence', () => {
  it('preserves existing diagnostics when their read fails, without preventing game saves', async () => {
    storage.loadTelemetry.mockRejectedValue(new Error('temporary read failure'));
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.game).toBeDefined());
    await act(() => result.current.flush());
    expect(storage.saveGame).toHaveBeenCalled();
    expect(storage.saveTelemetry).not.toHaveBeenCalled();
    expect(result.current.status).toContain('diagnostics storage unavailable');
    unmount();
  });

  it('reports a failed manual save to its caller and retries pending state', async () => {
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.game).toBeDefined());
    storage.saveGame.mockRejectedValueOnce(new Error('quota reached'));
    await act(async () => { await expect(result.current.createManualSave()).rejects.toThrow('quota reached'); });
    expect(result.current.status).toContain('Save failed');
    await act(() => result.current.flush());
    expect(result.current.status).toBe('Saved');
    unmount();
  });

  it('restores counters and persists the latest synchronous actions in order', async () => {
    const game = createNewGameState();
    storage.getGame.mockResolvedValue({ game });
    const trace = createPlayTelemetry(game.id);
    trace.counters.goldGained = 10;
    storage.loadTelemetry.mockResolvedValue(trace);
    const { result, unmount } = renderHook(useGameSession);
    await waitFor(() => expect(result.current.game).toBeDefined());
    act(() => {
      for (let i = 0; i < 3; i++) result.current.transition(state => ({ ...state, inventory: { ...state.inventory, gold: state.inventory.gold + 1 } }), { source: 'manual', action: 'test' });
    });
    await act(() => result.current.flush());
    expect(result.current.telemetry?.counters.goldGained).toBe(13);
    expect(storage.saveGame.mock.lastCall?.[3].inventory.gold).toBe(game.inventory.gold + 3);
    expect(storage.saveTelemetry.mock.lastCall?.[0].sequence).toBe(3);
    unmount();
  });
});

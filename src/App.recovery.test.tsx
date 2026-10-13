import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { exploreView } from './components/ExploreScreen.test-support';
import type { useGameSession } from './hooks/useGameSession';
import type { GameSession } from './services/game/GameSession';

const state = vi.hoisted(() => ({ session: {} as ReturnType<typeof useGameSession>, cancel: vi.fn(), movement: vi.fn() }));
vi.mock('./hooks/useGameSession', () => ({ useGameSession: () => state.session }));
vi.mock('./hooks/useCanonicalMovement', () => ({ useCanonicalMovement: (...args: unknown[]) => {
  state.movement(...args); return { cancel: state.cancel, navigate: vi.fn(), message: '' };
} }));
vi.mock('./hooks/useGameCommands', () => ({ useGameCommands: () => ({}) }));
vi.mock('./hooks/useCanonicalAuto', () => ({ useCanonicalAuto: () => ({ cancel: state.cancel, message: '' }) }));
vi.mock('./components/ExploreScreen', () => ({ ExploreScreen: () => <div>Canonical expedition</div> }));
vi.mock('./hooks/useAgenticPlay', () => { throw Error('Recovery must not import the retired provider hook'); });

beforeEach(() => {
  vi.clearAllMocks();
  state.session = { controlled: false, busy: false, recoveryRequired: true,
    status: 'Action failed: Invalid canonical checkpoint', saves: [], diagnostics: [], controller: {} as GameSession,
    retry: vi.fn(async () => {}), resetGame: vi.fn(async () => {}), takeControl: vi.fn(async () => {}),
    createManualSave: vi.fn(async () => {}), loadSave: vi.fn(async () => {}), removeSave: vi.fn(async () => {}),
    refreshSaves: vi.fn(async () => {}), flush: vi.fn(async () => {}),
  };
});
afterEach(cleanup);

describe('canonical App recovery controls', () => {
  it.each(['Invalid canonical checkpoint', 'IndexedDB unsupported', 'storage denied'])
    ('exposes explicit recovery without showing a retained game as playable: %s', async message => {
      state.session.status = `Action failed: ${message}`;
      state.session.game = { ...exploreView(), autoThrottleMs: 500, randomBattles: false };
      render(<App />);
      expect(screen.getByRole('status')).toHaveTextContent(state.session.status);
      expect(screen.queryByText('Canonical expedition')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Take control' })).not.toBeInTheDocument();
      expect(state.movement).toHaveBeenLastCalledWith(state.session.game, true, state.session.controller, state.cancel);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(state.session.retry).toHaveBeenCalledOnce());
      expect(state.session.resetGame).not.toHaveBeenCalled();
    });

  it('requires two-stage reset confirmation and blocks duplicates while awaiting storage', async () => {
    let finish!: () => void;
    vi.mocked(state.session.resetGame).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset and start new game' }));
    expect(screen.getByRole('dialog', { name: 'Reset Maze Battle?' })).toBeVisible();
    expect(screen.getByText(/discards this game's saves and observation history/)).toBeVisible();
    expect(screen.getByText(/Separate expedition data is not cleared/)).toBeVisible();
    expect(state.session.resetGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset and start new game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard saves and start new game' }));
    expect(state.session.resetGame).toHaveBeenCalledOnce(); expect(state.cancel).toHaveBeenCalledTimes(2);
    expect(state.cancel.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(state.session.resetGame).mock.invocationCallOrder[0]);
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Working...' })); expect(state.session.resetGame).toHaveBeenCalledOnce();
    await act(async () => { finish(); }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps reset rejection visible and permits an explicit retry', async () => {
    vi.mocked(state.session.resetGame).mockRejectedValueOnce(new Error('Storage is unavailable'));
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset and start new game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard saves and start new game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    state.session.status = 'Action failed: Storage is unavailable'; rerender(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(state.session.status);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset and start new game' })).toBeEnabled();
  });

  it('blocks recovery actions and navigation during canonical preparation', () => {
    state.session.busy = true; state.session.status = 'Preparing dungeon 1: content'; render(<App />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset and start new game' })).toBeDisabled();
    expect(state.movement).toHaveBeenLastCalledWith(undefined, true, state.session.controller, state.cancel);
    expect(state.session.resetGame).not.toHaveBeenCalled();
  });

  it('treats a validated read-only projection as custody loss, not corrupt-save recovery', async () => {
    state.session.game = { ...exploreView(), autoThrottleMs: 500, randomBattles: false };
    state.session.recoveryRequired = false; state.session.status = 'Read only: another tab controls this game.';
    render(<App />);
    expect(screen.getByText('Canonical expedition')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reset and start new game' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
    await waitFor(() => expect(state.session.takeControl).toHaveBeenCalledOnce());
    expect(state.cancel).toHaveBeenCalledOnce(); expect(state.session.resetGame).not.toHaveBeenCalled();
  });
});

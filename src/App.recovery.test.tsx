import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createNewGameState } from './domain/gameFactory';
import type { useGameSession } from './hooks/useGameSession';

const state = vi.hoisted(() => ({ session: {} as ReturnType<typeof useGameSession>, pause: vi.fn(), cancel: vi.fn() }));
vi.mock('./hooks/useGameSession', () => ({ useGameSession: () => state.session }));
vi.mock('./hooks/useAgenticPlay', () => ({ useAgenticPlay: () => ({ pause: state.pause }) }));
vi.mock('./hooks/useClickNavigation', () => ({ useClickNavigation: () => ({ cancel: state.cancel }) }));
vi.mock('./hooks/useGameLoop', () => ({ useGameLoop: () => 0 }));
vi.mock('./hooks/useGameCommands', () => ({ useGameCommands: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  state.session = { controlled: false, busy: false, recoveryRequired: true,
    status: 'Load failed: Invalid observation history', saves: [],
    retry: vi.fn(async () => {}), resetGame: vi.fn(async () => {}),
  } as unknown as ReturnType<typeof useGameSession>;
});
afterEach(cleanup);

describe('ordinary preview recovery controls', () => {
  it.each(['Load failed: Invalid observation history', 'Load failed: IndexedDB unsupported', 'Save failed: storage denied'])
    ('exposes Retry and explicit reset without mislabeling %s as read-only', async status => {
      state.session.status = status;
      if (status.startsWith('Save')) state.session.game = createNewGameState();
      render(<App />);
      expect(screen.getByRole('status')).toHaveTextContent(status);
      expect(screen.queryByText(/Read only/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset and start new game' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(state.session.retry).toHaveBeenCalledOnce());
      expect(state.session.resetGame).not.toHaveBeenCalled();
    });

  it('requires two-stage confirmation, supports cancel, and locks duplicate actions while resetting', async () => {
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
    expect(state.session.resetGame).toHaveBeenCalledOnce();
    expect(state.pause).toHaveBeenCalledOnce();
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => { finish(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reports failed reset in the confirmation and retains both recovery actions', async () => {
    vi.mocked(state.session.resetGame).mockRejectedValue(new Error('Storage is unavailable'));
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset and start new game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard saves and start new game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    state.session.status = 'Reset failed: Storage is unavailable';
    rerender(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(state.session.status);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset and start new game' })).toBeEnabled();
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { exploreView } from '../ExploreScreen.test-support';
import type { useGameSession } from '../../hooks/useGameSession';
import type { GameSession } from '../../services/game/GameSession';

const state = vi.hoisted(() => ({ session: {} as ReturnType<typeof useGameSession>, cancel: vi.fn(), movement: vi.fn(), execute: vi.fn() }));
vi.mock('../../hooks/useGameSession', () => ({ useGameSession: () => state.session }));
vi.mock('../../hooks/useCanonicalMovement', () => ({ useCanonicalMovement: (...args: unknown[]) => {
  state.movement(...args); return { cancel: state.cancel, navigate: vi.fn(), message: '' };
} }));
vi.mock('../../hooks/useGameCommands', () => ({ useGameCommands: () => ({}) }));
vi.mock('../../hooks/useCanonicalAuto', () => ({ useCanonicalAuto: () => ({ cancel: state.cancel, message: '' }) }));
vi.mock('../../hooks/useMazePerception', () => ({ useMazePerception: () => ({ pending: false }) }));
vi.mock('../MazeCanvas', () => ({ MazeCanvas: () => <canvas aria-label="Dungeon map" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Offline App attempted fetch'); }));
  vi.stubGlobal('WebSocket', vi.fn(() => { throw Error('Offline App attempted WebSocket'); }));
  state.session = { game: { ...exploreView(), autoThrottleMs: 500, randomBattles: false }, controlled: true,
    status: 'Ready', saves: [], diagnostics: [], controller: { execute: state.execute } as unknown as GameSession,
    retry: vi.fn(async () => {}), resetGame: vi.fn(async () => {}), takeControl: vi.fn(async () => {}),
    createManualSave: vi.fn(async () => {}), loadSave: vi.fn(async () => {}), removeSave: vi.fn(async () => {}),
    refreshSaves: vi.fn(async () => {}), flush: vi.fn(async () => {}),
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('canonical App Agentic offline boundary', () => {
  it('opens only an unavailable notice with no host, launch, recovery or adoption controls', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Stop Agentic play' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    const dialog = screen.getByRole('dialog', { name: 'Agentic Play' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Agentica is unavailable during the canonical storage cutover. No service or model calls will be made.');
    expect(within(dialog).queryByLabelText('Host endpoint')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Start|Reconnect|Adopt|Stop/ })).not.toBeInTheDocument();
    expect(state.cancel).toHaveBeenCalledTimes(2); expect(state.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  });

  it('blocks navigation while the notice is open and never activates on close or rerender', () => {
    const { rerender } = render(<App />), game = state.session.game;
    expect(state.movement).toHaveBeenLastCalledWith(game, false, state.session.controller, state.cancel);
    fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    expect(state.movement).toHaveBeenLastCalledWith(game, true, state.session.controller, state.cancel);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    state.session.game = { ...state.session.game! }; rerender(<App />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.movement).toHaveBeenLastCalledWith(state.session.game, false, state.session.controller, state.cancel);
    expect(state.execute).not.toHaveBeenCalled(); expect(state.session.resetGame).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  });

  it('remains offline in a read-only session without taking custody or changing quest state', () => {
    state.session.controlled = false; state.session.status = 'Read only';
    const before = structuredClone(state.session.game); render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    expect(screen.getByRole('dialog', { name: 'Agentic Play' })).toBeVisible();
    expect(state.session.game).toEqual(before); expect(state.session.takeControl).not.toHaveBeenCalled();
    expect(state.execute).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  });
});

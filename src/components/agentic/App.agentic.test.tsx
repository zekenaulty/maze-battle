import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../../domain/gameFactory';
import type { useGameSession } from '../../hooks/useGameSession';
import type { useAgenticPlay } from '../../hooks/useAgenticPlay';
import { App } from '../../App';

const state = vi.hoisted(() => ({ session: {} as ReturnType<typeof useGameSession>,
  agent: {} as ReturnType<typeof useAgenticPlay>, navigate: vi.fn(), cancel: vi.fn() }));
vi.mock('../../hooks/useGameSession', () => ({ useGameSession: () => state.session }));
vi.mock('../../hooks/useAgenticPlay', () => ({ useAgenticPlay: () => state.agent }));
vi.mock('../../hooks/useClickNavigation', () => ({ useClickNavigation: () => ({ navigate: state.navigate, cancel: state.cancel, message: '' }) }));
vi.mock('../MazeCanvas', () => ({ MazeCanvas: ({ onTileClick }: { onTileClick?: (position: { row: number; column: number }) => void }) =>
  <button onClick={() => onTileClick?.({ row: 1, column: 1 })}>Walk target</button> }));

beforeEach(() => {
  vi.clearAllMocks();
  state.session = { game: createNewGameState({ mode: 'manual' }), controlled: true, status: 'Ready', saves: [],
    transition: vi.fn(), flush: vi.fn(async () => {}), refreshSaves: vi.fn(async () => {}),
  } as unknown as ReturnType<typeof useGameSession>;
  state.agent = { view: { state: 'running', connected: true, steps: 4, replans: 0, runId: 'run-one' },
    busy: false, canStop: true, error: undefined, pause: vi.fn(), stop: vi.fn(async () => {}),
    start: vi.fn(async () => {}), reconnect: vi.fn(async () => {}), adopt: vi.fn(async () => {}) };
});
afterEach(cleanup);

describe('actual game Agentic play wiring', () => {
  it('passes explicit exploration mode and actor origin through the actual App', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(state.agent.start).toHaveBeenCalledWith('ws://127.0.0.1:5085/api/host',
      { floor: state.session.game!.dungeonLevel, ...state.session.game!.maze.active }, 'exploration');
  });
  it('opens and starts from the agent dialog without a manual pause and ignores game rerenders', () => {
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    expect(screen.getByRole('dialog', { name: 'Agentic play' })).toBeVisible();
    expect(screen.getByLabelText('Host endpoint')).toHaveValue('ws://127.0.0.1:5085/api/host');
    expect(state.agent.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(state.agent.start).toHaveBeenCalledOnce();
    expect(state.agent.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    state.session.game = { ...state.session.game! };
    rerender(<App />);
    expect(state.agent.pause).not.toHaveBeenCalled();
    expect(state.agent.reconnect).not.toHaveBeenCalled();
  });

  it.each(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowRight'])('preserves keyboard %s and pauses before dispatch', key => {
    render(<App />);
    fireEvent.keyDown(window, { key });
    expect(state.agent.pause).toHaveBeenCalledOnce();
    expect(state.session.transition).toHaveBeenCalledOnce();
    expect(vi.mocked(state.agent.pause).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(state.session.transition).mock.invocationCallOrder[0]);
  });

  it.each(['Move north', 'Walk target', 'Auto', 'Waves', 'Party', 'Saves', 'Expedition settings', 'Map', 'Portal (2)'])
    ('pauses on %s without semantic cancellation', name => {
      render(<App />);
      const button = name.startsWith('Portal') ? screen.getByRole('button', { name: /^Portal/ }) : screen.getByRole('button', { name });
      fireEvent.click(button);
      expect(state.agent.pause).toHaveBeenCalled();
      expect(state.agent.stop).not.toHaveBeenCalled();
      if (name === 'Walk target') {
        expect(state.navigate).toHaveBeenCalledWith({ row: 1, column: 1 });
        expect(vi.mocked(state.agent.pause).mock.invocationCallOrder[0]).toBeLessThan(state.navigate.mock.invocationCallOrder[0]);
      }
    });

  it('keeps an independent Stop in the explore toolbar during a pending command', () => {
    state.agent.busy = true;
    render(<App />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Agentic play' }));
    expect(state.agent.stop).toHaveBeenCalledOnce();
    expect(state.session.transition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Auto' })).toBeEnabled();
  });
});

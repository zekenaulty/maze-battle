import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { exploreView } from '../ExploreScreen.test-support';
import { characterFixture } from '../../viewModels/characterTestFixtures';
import type { GameView } from '../../services/game/GameView';

let game: GameView;
const callbacks = vi.hoisted(() => ({ skill: vi.fn(), cancel: vi.fn() }));
vi.mock('../../hooks/useGameSession', () => ({ useGameSession: () => ({
  game, controlled: true, busy: false, status: 'Ready', controller: {},
}) }));
vi.mock('../../hooks/useGameAgenticPlay', () => ({ useGameAgenticPlay: () => ({ active: false }) }));
vi.mock('../../hooks/useCanonicalMovement', () => ({ useCanonicalMovement: () => ({ cancel: callbacks.cancel }) }));
vi.mock('../../hooks/useCanonicalAuto', () => ({ useCanonicalAuto: () => ({ cancel: callbacks.cancel }) }));
vi.mock('../../hooks/useCanonicalBattle', () => ({ useCanonicalBattle: () => ({ cancel: callbacks.cancel }) }));
vi.mock('../../hooks/useGameCommands', () => ({ useGameCommands: () => ({ skill: callbacks.skill }) }));
vi.mock('../ExploreScreen', () => ({ ExploreScreen: ({ onCharacters }: { onCharacters: () => void }) =>
  <button onClick={onCharacters}>Party</button> }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('the mounted App lets Skills expire cooldowns without a session publication or automatic action', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  game = { ...exploreView(), party: [characterFixture({ id: 'healer', role: 'healer',
    skills: [{ id: 'heal', cooldown: 0, cooldownUntil: 2000 }] })] };
  const before = structuredClone(game);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Party' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
  await act(async () => {});
  const cast = screen.getByRole('button', { name: 'Cast Heal' });
  expect(cast).toBeDisabled();
  expect(cast).toHaveAccessibleDescription('Cooldown 1s');
  act(() => vi.advanceTimersByTime(750));
  expect(cast).toBeDisabled();
  act(() => vi.advanceTimersByTime(250));
  expect(cast).toBeEnabled();
  expect(game).toEqual(before);
  expect(callbacks.skill).not.toHaveBeenCalled();
  fireEvent.click(cast);
  expect(callbacks.skill).toHaveBeenCalledExactlyOnceWith('healer', 'heal');
  fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
  expect(vi.getTimerCount()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  expect(vi.getTimerCount()).toBe(0);
  expect(callbacks.skill).toHaveBeenCalledTimes(1);
  expect(game).toEqual(before);
});

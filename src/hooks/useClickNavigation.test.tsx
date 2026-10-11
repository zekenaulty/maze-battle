import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, useCallback } from 'react';
import { createNewGameState } from '../domain/gameFactory';
import { lineMaze, chestAt } from '../domain/automation/autopilotTestFixtures';
import type { GameTransition } from './useGameLoop';
import { CLICK_STEP_MS, useClickNavigation } from './useClickNavigation';

afterEach(() => { cleanup(); vi.useRealTimers(); document.querySelectorAll('dialog').forEach(d => d.remove()); });
const fixture = () => createNewGameState({ randomBattles: false, maze: lineMaze(9), chests: [chestAt(3)] });
function harness(paused: boolean) {
  const [game, setGame] = useState(fixture);
  const transition = useCallback<GameTransition>(update => setGame(update), []);
  return { game, setGame, ...useClickNavigation(game, paused, transition) };
}
const tick = () => act(() => vi.advanceTimersByTime(CLICK_STEP_MS));

describe('bounded local click execution', () => {
  it('walks multiple cells without looting and stops at arrival', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => harness(false));
    const before = result.current.game;
    act(() => result.current.navigate({ row: 0, column: 3 }));
    tick(); tick(); tick(); tick(); tick();
    expect(result.current.game.maze.active.column).toBe(3);
    expect(result.current.game.chests).toEqual(before.chests);
    expect(result.current.game.inventory).toEqual(before.inventory);
    expect(result.current.message).toContain('Arrived');
  });
  it.each(['cancel', 'paused', 'town', 'battle', 'auto', 'obstruction', 'dialog'])("cancels on %s and never resumes", cause => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ paused }) => harness(paused), { initialProps: { paused: false } });
    act(() => result.current.navigate({ row: 0, column: 5 }));
    tick();
    expect(result.current.game.maze.active.column).toBe(1);
    act(() => {
      if (cause === 'cancel') result.current.cancel();
      if (cause === 'paused') rerender({ paused: true });
      if (cause === 'town' || cause === 'auto') result.current.setGame(g => ({ ...g, mode: cause === 'town' ? 'town' : 'auto-play' }));
      if (cause === 'battle') result.current.setGame(g => ({ ...g, battle: { id: 'b', wave: 1, round: 1, status: 'active', enemies: [], log: [] } }));
      if (cause === 'obstruction') result.current.setGame(g => ({ ...g, maze: { ...g.maze, cells: g.maze.cells.map(c => ({ ...c, links: [] })) } }));
      if (cause === 'dialog') { const dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog); }
    });
    tick(); tick();
    act(() => rerender({ paused: false }));
    document.querySelector('dialog')?.remove();
    tick();
    expect(result.current.game.maze.active.column).toBe(1);
  });
  it('fences queued movement after cancellation and does not queue steps during a slow write', () => {
    vi.useFakeTimers();
    const game = fixture(), updates: Parameters<GameTransition>[0][] = [];
    const transition: GameTransition = update => updates.push(update);
    const { result } = renderHook(() => useClickNavigation(game, false, transition));
    act(() => result.current.navigate({ row: 0, column: 3 }));
    tick(); tick(); tick();
    expect(updates).toHaveLength(1);
    act(() => result.current.cancel());
    expect(updates[0](game)).toBe(game);
  });
  it('waits for slow publication, then continues without dispatching ahead', () => {
    vi.useFakeTimers();
    const game = fixture(), updates: Parameters<GameTransition>[0][] = [];
    const transition: GameTransition = update => updates.push(update);
    const { result, rerender } = renderHook(({ state }) => useClickNavigation(state, false, transition), { initialProps: { state: game } });
    act(() => result.current.navigate({ row: 0, column: 3 }));
    tick();
    const committed = updates[0](game);
    tick(); tick(); tick();
    expect(updates).toHaveLength(1);
    act(() => rerender({ state: committed }));
    tick();
    expect(updates).toHaveLength(2);
    expect(updates[1](committed).maze.active.column).toBe(2);
  });
  it('makes zero canonical dispatches for unknown or remembered unseen targets', () => {
    const game = fixture(), transition = vi.fn();
    game.maze.visibility = { radius: 2, explored: [{ row: 0, column: 5 }] };
    const { result } = renderHook(() => useClickNavigation(game, false, transition));
    act(() => result.current.navigate({ row: 0, column: 7 }));
    act(() => result.current.navigate({ row: 0, column: 5 }));
    expect(transition).not.toHaveBeenCalled();
  });
  it('retains the selected restricted route when unseen links change', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => harness(false));
    act(() => result.current.setGame(g => ({ ...g, maze: { ...g.maze, columns: 15,
      cells: lineMaze(15).cells, visibility: { radius: 3, explored: [] } } })));
    act(() => result.current.navigate({ row: 0, column: 3 }));
    tick();
    act(() => result.current.setGame(g => ({ ...g, maze: { ...g.maze, cells: g.maze.cells.map(c =>
      c.column > 7 ? { ...c, links: [] } : c) } })));
    tick(); tick(); tick();
    expect(result.current.game.maze.active.column).toBe(3);
    expect(result.current.message).toBe('Arrived');
  });
  it('never descends or interacts at a clicked stair tile', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => harness(false));
    act(() => result.current.setGame(g => ({ ...g, maze: { ...g.maze, end: { row: 0, column: 2 } } })));
    act(() => result.current.navigate({ row: 0, column: 2 }));
    tick(); tick(); tick();
    expect(result.current.game.dungeonLevel).toBe(1);
    expect(result.current.game.maze.active.column).toBe(2);
  });
});

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, GridPosition } from '../domain/types';
import { findClickRoute } from '../domain/maze/clickRoute';
import { samePosition } from '../domain/maze/key';
import { movePosition } from '../domain/maze/movement';
import { stopAllAutomation } from '../domain/automation/autoPlay';
import { moveManually, type GameTransition } from './useGameLoop';

export const CLICK_STEP_MS = 160;
const WALK_LIMIT_MS = 15_000;

export function useClickNavigation(game: GameState | undefined, paused: boolean, transition: GameTransition) {
  const [message, setMessage] = useState('');
  const active = useRef<ReturnType<typeof startWalk> | undefined>(undefined);
  const latest = useRef({ game, paused });
  latest.current = { game, paused };
  const cancel = useCallback(() => { active.current = undefined; setMessage(''); }, []);
  const navigate = useCallback((target: GridPosition) => {
    cancel();
    const { game, paused } = latest.current;
    if (!game || paused || game.battle || game.mode === 'town' || document.querySelector('dialog[open]')) return;
    const path = findClickRoute(game.maze, target);
    if (!path) { setMessage('No route through currently visible passages.'); return; }
    if (!path.distance) return;
    active.current = startWalk(game, path.directions);
    if (game.mode !== 'manual') transition(stopAllAutomation, { action: 'click-takeover', source: 'manual' });
    setMessage('Walking');
  }, [cancel, transition]);

  useEffect(() => {
    if (paused || !game || game.battle || game.mode === 'town') cancel();
  }, [game, paused, cancel]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const walk = active.current;
      if (!walk) return;
      const { game, paused } = latest.current;
      if (!game || paused || game.battle || game.mode !== 'manual' || game.id !== walk.gameId ||
        game.dungeonLevel !== walk.floor || Date.now() > walk.deadline || document.querySelector('dialog[open]')) { cancel(); return; }
      // Wait for the existing canonical transition to publish; never queue cells ahead.
      if (walk.pending) {
        if (!walk.committed || !samePosition(game.maze.active, walk.expected)) return;
        walk.pending = false;
      }
      if (!samePosition(game.maze.active, walk.expected)) { cancel(); return; }
      const direction = walk.directions[walk.index];
      if (!direction) { active.current = undefined; setMessage('Arrived'); return; }
      const destination = movePosition(walk.expected, direction);
      walk.pending = true;
      walk.committed = false;
      transition(state => {
        if (active.current !== walk || latest.current.paused || Date.now() > walk.deadline || document.querySelector('dialog[open]')) return state;
        if (state.id !== walk.gameId || state.dungeonLevel !== walk.floor || state.mode !== 'manual' || state.battle ||
          !samePosition(state.maze.active, walk.expected) || findClickRoute(state.maze, destination)?.directions[0] !== direction) {
          cancel(); return state;
        }
        const next = moveManually(state, direction, { triggerStairs: false });
        if (!samePosition(next.maze.active, destination)) { cancel(); return next; }
        walk.expected = destination;
        walk.index++;
        // Publication is checked on the next tick before issuing another step.
        walk.committed = true;
        return next;
      }, { action: 'click-walk', source: 'manual' });
    }, CLICK_STEP_MS);
    return () => { window.clearInterval(timer); active.current = undefined; };
  }, [cancel, transition]);
  return { navigate, cancel, message };
}

function startWalk(game: GameState, directions: NonNullable<ReturnType<typeof findClickRoute>>['directions']) {
  return { gameId: game.id, floor: game.dungeonLevel, expected: game.maze.active,
    directions, index: 0, pending: false, committed: false, deadline: Date.now() + WALK_LIMIT_MS };
}

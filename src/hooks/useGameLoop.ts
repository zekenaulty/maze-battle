import { useEffect, useState } from 'react';
import type { Direction, GameState } from '../domain/types';
import type { TransitionContext } from '../domain/telemetry/types';
import { advanceAutomaticPlay, autoControlActive, stopAllAutomation, wavesControlActive } from '../domain/automation/autoPlay';
import { automaticStepDelay } from '../domain/automation/schedule';
import { applyGameCommand } from '../domain/gameCommands';
import { ignoresGameKey } from './gameKeys';

export type GameTransition = (update: (game: GameState) => GameState, context: TransitionContext) => void;

export function moveManually(game: GameState, direction: Direction, options: { triggerStairs?: boolean } = {}): GameState {
  if (game.battle || game.mode === 'town') return game;
  const base = autoControlActive(game) || wavesControlActive(game) ? stopAllAutomation(game) : game;
  return applyGameCommand(base, { type: 'move', direction, triggerStairs: options.triggerStairs !== false }).game;
}

export function useGameLoop(game: GameState | undefined, paused: boolean, transition: GameTransition, onManualMove?: () => void) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!game || paused || game.automationPaused || game.battle?.status === 'lost') return;
    const battle = game.battle?.status === 'active';
    const active = battle ? game.party.some(a => a.autoBattle) :
      game.mode === 'auto-play' || game.mode === 'waves' || game.mode === 'town' && Boolean(game.townReturnMode && game.townReturnMode !== 'manual');
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.querySelector('dialog[open]')) return;
      transition(state => advanceAutomaticPlay(state), { action: battle ? 'battle-tick' : 'auto-step', source: 'auto' });
    }, automaticStepDelay(game));
    return () => window.clearInterval(id);
  }, [game, paused, transition]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (paused || ignoresGameKey(event) || document.querySelector('dialog[open]')) return;
      const direction = directions[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault();
      onManualMove?.();
      transition(state => moveManually(state, direction), { action: 'move', source: 'manual' });
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [paused, transition, onManualMove]);
  return clock;
}

const directions: Record<string, Direction> = { w: 'north', arrowup: 'north', d: 'east', arrowright: 'east', s: 'south', arrowdown: 'south', a: 'west', arrowleft: 'west' };

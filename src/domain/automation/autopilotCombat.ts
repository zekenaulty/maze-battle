import type { GameState } from '../types';
import { blockAutopilot, planningState } from './autopilotState';

export const MAX_STALLED_COMBAT_TICKS = 32;

export function trackAutopilotCombat(before: GameState, after: GameState): GameState {
  if (before.mode !== 'battle' || before.battle?.returnMode !== 'auto-play') return after;
  const state = before.autopilot ?? planningState(before);
  if (after.battle?.status === 'lost') return blockAutopilot(after, 'Party defeated; recover before resuming.');
  if (!after.battle) return { ...after, autopilot: { ...state, phase: 'planning', stalledTicks: 0, reason: 'Battle won; resuming floor work.' } };
  const enemyHp = (game: GameState) => game.battle?.enemies.reduce((total, enemy) => total + Math.max(0, enemy.hp), 0) ?? 0;
  const stalledTicks = enemyHp(after) < enemyHp(before) ? 0 : state.stalledTicks + 1;
  const tracked: GameState = {
    ...after,
    autopilot: { ...state, phase: 'combat', stalledTicks, reason: stalledTicks ? 'Waiting for combat progress.' : 'Fighting encounter.' },
  };
  return stalledTicks >= MAX_STALLED_COMBAT_TICKS ? blockAutopilot(tracked, 'Combat made no progress; manual action required.') : tracked;
}

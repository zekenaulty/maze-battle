import type { GameState } from '../types';
import { AUTO_MAZE_MIN_MS, WAVE_RESTART_MIN_MS } from './throttle';

export function automaticStepDelay(game: GameState): number {
  const minimum = game.battle?.status === 'active' ? 50
    : game.mode === 'waves' || game.mode === 'town' ? WAVE_RESTART_MIN_MS : AUTO_MAZE_MIN_MS;
  return Math.max(minimum, game.autoThrottleMs);
}

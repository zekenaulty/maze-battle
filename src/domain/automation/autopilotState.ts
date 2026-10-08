import type { AutopilotState, Direction, GameState, GridPosition } from '../types';

const PHASES: AutopilotState['phase'][] = ['planning', 'travel', 'interact', 'combat', 'town', 'blocked'];
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export function normalizeAutopilot(state: AutopilotState | undefined, floor: number): AutopilotState | undefined {
  if (!state) return undefined;
  const validRoute = Array.isArray(state.route) && state.route.every((direction) => DIRECTIONS.includes(direction));
  const sameFloor = state.floor === floor;
  return {
    phase: sameFloor && PHASES.includes(state.phase) ? state.phase : 'planning',
    floor,
    targetId: sameFloor && typeof state.targetId === 'string' ? state.targetId : undefined,
    targetPosition: sameFloor ? normalizePosition(state.targetPosition) : undefined,
    route: sameFloor && validRoute ? [...state.route] : [],
    lastPosition: sameFloor ? normalizePosition(state.lastPosition) : undefined,
    stalledTicks: sameFloor && Number.isFinite(state.stalledTicks) ? Math.max(0, Math.floor(state.stalledTicks)) : 0,
    reason: sameFloor && typeof state.reason === 'string' ? state.reason : 'Planning floor work.',
  };
}

export function planningState(game: GameState, reason = 'Planning floor work.'): AutopilotState {
  return { phase: 'planning', floor: game.dungeonLevel, route: [], lastPosition: { ...game.maze.active }, stalledTicks: 0, reason };
}

export function stopAutopilot(game: GameState, reason = 'Autopilot stopped.'): GameState {
  return {
    ...game,
    mode: game.mode === 'auto-play' ? 'manual' : game.mode,
    battle: game.battle?.returnMode === 'auto-play' ? { ...game.battle, returnMode: 'manual' } : game.battle,
    townReturnMode: game.townReturnMode === 'auto-play' ? 'manual' : game.townReturnMode,
    autopilot: { ...(game.autopilot ?? planningState(game)), reason },
    updatedAt: new Date().toISOString(),
  };
}

export function blockAutopilot(game: GameState, reason: string): GameState {
  const stopped = stopAutopilot(game, reason);
  return {
    ...stopped,
    mode: stopped.mode === 'waves' ? 'manual' : stopped.mode,
    battle: stopped.battle?.returnMode === 'waves' ? { ...stopped.battle, returnMode: 'manual' } : stopped.battle,
    townReturnMode: stopped.townReturnMode === 'waves' ? 'manual' : stopped.townReturnMode,
    autopilot: { ...stopped.autopilot!, phase: 'blocked', route: [], stalledTicks: Math.max(1, stopped.autopilot!.stalledTicks) },
    activityLog: [`Auto stopped: ${reason}`, ...game.activityLog].slice(0, 20),
  };
}

function normalizePosition(position?: GridPosition) {
  return position && Number.isInteger(position.row) && Number.isInteger(position.column) && position.row >= 0 && position.column >= 0
    ? { ...position } : undefined;
}

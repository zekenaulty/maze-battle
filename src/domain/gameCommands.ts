import type { Direction, GameState } from './types';
import { moveActive } from './gameFactory';
import { samePosition } from './maze/key';
import { chestAtActivePosition, openChest } from './items/chests';
import { shouldStartEncounter } from './combat/encounters';
import { startBattle } from './combat/battleEngine';
import { defaultRng, type Rng } from './combat/rng';

/** Internal game commands, not an agent tool catalog or an automation policy. */
export type GameCommand = { type: 'move'; direction: Direction; triggerStairs: boolean }
  | { type: 'open-chest'; chestId: string };
export interface GameCommandOutcome {
  status: 'applied' | 'refused';
  reason: 'moved' | 'blocked' | 'ineligible' | 'opened';
}

/** Shared physics and voluntary effects. Target selection and Auto policy stay outside. */
export function applyGameCommand(game: GameState, command: GameCommand, rng: Rng = defaultRng):
  { game: GameState; outcome: GameCommandOutcome } {
  const refused = (reason: 'blocked' | 'ineligible', state = game) =>
    ({ game: state, outcome: { status: 'refused' as const, reason } });
  if (game.battle || game.mode === 'town' || game.party.every(actor => actor.hp <= 0)) return refused('ineligible');
  if (command.type === 'open-chest') {
    if (chestAtActivePosition(game)?.id !== command.chestId) return refused('ineligible');
    return { game: openChest(game, command.chestId, rng), outcome: { status: 'applied', reason: 'opened' } };
  }
  const moved = moveActive(game, command.direction, { triggerStairs: command.triggerStairs });
  if (samePosition(moved.maze.active, game.maze.active) && moved.dungeonLevel === game.dungeonLevel && moved.mode === game.mode)
    return refused('blocked', moved); // Facing may change even when translation cannot.
  const encounter = moved.dungeonLevel === game.dungeonLevel && moved.mode === game.mode && shouldStartEncounter(moved, rng);
  return { game: encounter ? startBattle(moved, rng) : moved, outcome: { status: 'applied', reason: 'moved' } };
}

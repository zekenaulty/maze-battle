import type { GameState } from '../types';
import { roomAtPosition } from '../quests/questTargets';
import { roll, type Rng } from './rng';

export function shouldStartEncounter(game: GameState, rng: Rng) {
  // Call after movement; share battle attribution's legacy overlap priority.
  const room = roomAtPosition(game);
  const safe = room && (room.tags?.includes('safe') || room.kind === 'safe' || room.kind === 'hub' || room.kind === 'start');
  return game.randomBattles && !safe && roll(100, rng) <= 35;
}

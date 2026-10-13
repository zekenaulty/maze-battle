import type { GameState } from '../types';
import { useConsumable } from '../items/inventory';
import { leaveTown, maintainTown, useTownPortal } from '../town/town';
import { castExplorationSkill } from '../party/partyActions';
import type { Rng } from '../combat/rng';
import { blockAutopilot, planningState } from './autopilotState';
import { packSlotUsage } from '../items/packCapacity';
import { travelCareChoices } from './autoPolicy';

export function advanceTownCare(game: GameState): GameState {
  const ready = maintainTown(game);
  if (game.autopilot?.phase !== 'town') return {
    ...ready, autopilot: { ...(game.autopilot ?? planningState(game)), phase: 'town', reason: 'Rested and managed supplies.' },
  };
  if (packSlotUsage(ready) >= ready.inventory.capacity) {
    return blockAutopilot(ready, 'Pack is full after town care; sell, stash or unlock items.');
  }
  return { ...leaveTown(ready), autopilot: planningState(ready, 'Supplies ready; returning to expedition.') };
}

export function careBeforeTravel(game: GameState, rng: Rng, now: number): GameState {
  for (const choice of travelCareChoices(game)) {
    if (choice.kind === 'block') return blockAutopilot(game, choice.reason);
    if (choice.kind === 'portal') return { ...useTownPortal(game),
      autopilot: { ...(game.autopilot ?? planningState(game)), phase: 'planning', reason: choice.reason } };
    const next = choice.kind === 'camp' ? castExplorationSkill(game, choice.actorId, choice.skillId, rng, now)
      : useConsumable(game, choice.itemId, choice.actorId);
    if (next !== game) return next;
  }
  return game;
}

import type { GameState } from '../types';
import { getEffectiveActor, useConsumable } from '../items/inventory';
import { canUseTownPortal, leaveTown, maintainTown, useTownPortal } from '../town/town';
import { castExplorationSkill } from '../party/partyActions';
import type { Rng } from '../combat/rng';
import { blockAutopilot, planningState } from './autopilotState';
import { packSlotUsage } from '../items/packCapacity';

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
  const party = game.party.map(a => getEffectiveActor(a, game.inventory));
  const injured = party.filter(a => a.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  const lowest = injured[0];
  const healer = party.find(a => a.role === 'healer' && a.hp > 0);
  const dead = party.some(a => a.hp <= 0);
  if (healer && dead) {
    const revived = castExplorationSkill(game, healer.id, 'resurrect', rng, now);
    if (revived !== game) return revived;
  }
  if (lowest && lowest.hp / lowest.maxHp < 0.55) {
    const herb = game.inventory.items.find(i => i.consumableEffect === 'heal' && !i.locked);
    if (herb) {
      const healed = useConsumable(game, herb.id, lowest.id);
      if (healed !== game) return healed;
    }
    if (healer) {
      const healed = castExplorationSkill(game, healer.id, 'heal', rng, now);
      if (healed !== game) return healed;
    }
  }
  if (healer && healer.mp < 8 && lowest && lowest.hp < lowest.maxHp * 0.8) {
    const mana = game.inventory.items.find(i => i.consumableEffect === 'mana' && !i.locked);
    if (mana) {
      const restored = useConsumable(game, mana.id, healer.id);
      if (restored !== game) return restored;
    }
  }
  const full = packSlotUsage(game) >= game.inventory.capacity;
  const needsRest = dead || !lowest || lowest.hp < lowest.maxHp * 0.4;
  if (!full && !needsRest) return game;
  const reason = full ? 'Pack capacity reached; visiting town.' : 'Party needs recovery; visiting town.';
  if (!canUseTownPortal(game)) return blockAutopilot(game, `${reason} No usable portal scroll; manual return required.`);
  const town = useTownPortal(game);
  return { ...town, autopilot: { ...(game.autopilot ?? planningState(game)), phase: 'planning', reason } };
}

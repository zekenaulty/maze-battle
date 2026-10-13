import type { QuestObjective } from '../types';
import type { RosterState } from '../party/roster';
import { getEffectiveActor } from '../items/equipment';
import { packSlotUsage } from '../items/packCapacity';
import { canUseTownPortal } from '../town/portal';

export const QUEST_PRIORITY: Readonly<Record<QuestObjective, number>> = { fetch: 1000, kill: 900, scout: 800, locate: 700 };
export const autoScore = (priority: number, distance: number) => distance * 10 - priority;
export function compareAutoTargets(a: { id: string; priority: number; distance: number }, b: typeof a) {
  return autoScore(a.priority, a.distance) - autoScore(b.priority, b.distance)
    || b.priority - a.priority || a.distance - b.distance || a.id.localeCompare(b.id);
}

export type TravelCare = { kind: 'camp'; actorId: string; skillId: 'heal' | 'resurrect' }
  | { kind: 'use'; itemId: string; actorId: string }
  | { kind: 'portal'; reason: string } | { kind: 'block'; reason: string };

/** Ordered policy choices. The shared command rules decide whether a skill/item can actually act. */
export function travelCareChoices(game: RosterState): TravelCare[] {
  const party = game.party.map(a => getEffectiveActor(a, game.inventory));
  const lowest = party.filter(a => a.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const healer = party.find(a => a.role === 'healer' && a.hp > 0), dead = party.some(a => a.hp <= 0);
  const choices: TravelCare[] = [];
  if (healer && dead) choices.push({ kind: 'camp', actorId: healer.id, skillId: 'resurrect' });
  if (lowest && lowest.hp / lowest.maxHp < 0.55) {
    const herb = game.inventory.items.find(i => i.consumableEffect === 'heal' && !i.locked);
    if (herb) choices.push({ kind: 'use', itemId: herb.id, actorId: lowest.id });
    if (healer) choices.push({ kind: 'camp', actorId: healer.id, skillId: 'heal' });
  }
  if (healer && healer.mp < 8 && lowest && lowest.hp < lowest.maxHp * 0.8) {
    const mana = game.inventory.items.find(i => i.consumableEffect === 'mana' && !i.locked);
    if (mana) choices.push({ kind: 'use', itemId: mana.id, actorId: healer.id });
  }
  const full = packSlotUsage(game) >= game.inventory.capacity;
  if (full || dead || !lowest || lowest.hp < lowest.maxHp * 0.4) {
    const reason = full ? 'Pack capacity reached; visiting town.' : 'Party needs recovery; visiting town.';
    choices.push(canUseTownPortal(game) ? { kind: 'portal', reason }
      : { kind: 'block', reason: `${reason} No usable portal scroll; manual return required.` });
  }
  return choices;
}

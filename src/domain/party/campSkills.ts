import type { RosterState } from './roster';
import { applySkill, type CombatContext } from '../combat/applySkill';
import { canUseSkill, refreshTimedSkills } from '../combat/combatant';
import { defaultRng, type Rng } from '../combat/rng';
import { getEffectiveActor, getEquipmentStats } from '../items/equipment';

export const CAMP_SKILLS = ['heal', 'groupHeal', 'resurrect'] as const;
export type CampSkill = typeof CAMP_SKILLS[number];
type CampState = Pick<RosterState, 'party' | 'inventory' | 'battle' | 'mode' | 'updatedAt' | 'activityLog'>;

/** Uses the combat skill rules without a battle, world projection or exploration side effects. */
export function castCampSkill<T extends CampState>(game: T, actorId: string, skillId: CampSkill, rng: Rng = defaultRng, now = Date.now()): T {
  if (game.battle || game.mode === 'battle' || !CAMP_SKILLS.includes(skillId)) return game;
  const original = game.party.find(a => a.id === actorId);
  if (!original || !canUseSkill(original, skillId, now)) return game;
  if (skillId === 'resurrect' ? game.party.every(a => a.hp > 0)
    : !game.party.some(a => a.hp > 0 && a.hp < getEffectiveActor(a, game.inventory).maxHp)) return game;

  const party = structuredClone(game.party);
  party.forEach(actor => refreshTimedSkills(actor, now));
  const context: CombatContext = {
    party, enemies: [], defeated: [], log: [], loot: [], rng, now,
    equipmentBonuses: Object.fromEntries(party.map(actor => [actor.id, getEquipmentStats(actor, game.inventory)])),
  };
  if (!applySkill(party.find(a => a.id === actorId)!, skillId, context)) return game;
  return {
    ...game, party: context.party, updatedAt: new Date(now).toISOString(),
    activityLog: [...context.log.reverse(), ...game.activityLog].slice(0, 12),
  };
}

import type { BattleState, GameState } from '../types';
import { isAlive, refreshTimedSkills } from './combatant';
import type { CombatContext } from './applySkill';
import { grantRewards } from './rewards';
import type { Rng } from './rng';
import { rollLoot } from '../items/loot';
import { getEquipmentStats } from '../items/inventory';

export function createCombatContext(game: GameState, rng: Rng, now = Date.now()): CombatContext {
  const party = game.party.map(copyActor);
  const enemies = game.battle?.enemies.map(copyEnemy) ?? [];
  const equipmentBonuses = Object.fromEntries(party.map((actor) => [actor.id, getEquipmentStats(actor, game.inventory)]));

  party.forEach((actor) => refreshTimedSkills(actor, now));
  enemies.forEach((enemy) => refreshTimedSkills(enemy, now));

  return {
    party,
    enemies,
    log: [...(game.battle?.log ?? [])],
    loot: [...(game.battle?.loot ?? [])],
    equipmentBonuses,
    rng,
    now,
  };
}

export function removeDefeated(context: CombatContext, rng: Rng) {
  const defeated = context.enemies.filter((enemy) => !isAlive(enemy));
  if (defeated.length === 0) {
    return false;
  }

  context.party = grantRewards(context.party, defeated, rng);
  context.loot.push(...defeated.flatMap((enemy) => rollLoot({ source: 'battle', level: enemy.level }, rng)));
  context.enemies = context.enemies.filter(isAlive);
  context.log.push(`${defeated.length} enemy${defeated.length === 1 ? '' : 'ies'} defeated.`);
  return true;
}

export function battleStatus(context: CombatContext) {
  if (context.party.every((actor) => !isAlive(actor))) {
    return 'lost';
  }

  return context.enemies.length === 0 ? 'won' : 'active';
}

function copyActor(actor: GameState['party'][number]) {
  return {
    ...actor,
    equipment: { ...actor.equipment },
    attributes: { ...actor.attributes },
    combat: { ...actor.combat },
    skills: actor.skills.map((skill) => ({ ...skill })),
  };
}

function copyEnemy(enemy: BattleState['enemies'][number]) {
  return {
    ...enemy,
    attributes: { ...enemy.attributes },
    combat: { ...enemy.combat },
    skills: enemy.skills.map((skill) => ({ ...skill })),
  };
}

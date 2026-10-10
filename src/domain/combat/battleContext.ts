import type { BattleState, GameState } from '../types';
import { isAlive, refreshTimedSkills } from './combatant';
import type { CombatContext } from './applySkill';
import { grantRewards } from './rewards';
import type { Rng } from './rng';
import { rollLoot } from '../items/loot';
import { getEquipmentStats } from '../items/inventory';

// Kept local until the integration-owned BattleState exposes the optional save field.
export interface RewardedBattleState extends BattleState {
  rewardGold?: number;
}

export interface BattleCombatContext extends CombatContext {
  rewardGold: number;
}

export function battleRewardGold(battle: RewardedBattleState | undefined) {
  const gold = battle?.rewardGold;
  return typeof gold === 'number' && Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
}

export function createCombatContext(game: GameState, rng: Rng, now = Date.now()): BattleCombatContext {
  const party = game.party.map(copyActor);
  const enemies = game.battle?.enemies.map(copyEnemy) ?? [];
  const equipmentBonuses = Object.fromEntries(party.map((actor) => [actor.id, getEquipmentStats(actor, game.inventory)]));

  party.forEach((actor) => refreshTimedSkills(actor, now));
  enemies.forEach((enemy) => refreshTimedSkills(enemy, now));

  return {
    party,
    enemies,
    defeated: game.battle?.defeated?.map(copyEnemy) ?? [],
    log: [...(game.battle?.log ?? [])],
    loot: [...(game.battle?.loot ?? [])],
    rewardGold: battleRewardGold(game.battle),
    equipmentBonuses,
    rng,
    now,
  };
}

export function removeDefeated(context: BattleCombatContext, rng: Rng) {
  const dead = context.enemies.filter((enemy) => !isAlive(enemy));
  if (dead.length === 0) {
    return false;
  }

  const seen = new Set(context.defeated.map((enemy) => enemy.id));
  const defeated = dead.filter((enemy) => {
    if (seen.has(enemy.id)) return false;
    seen.add(enemy.id);
    return true;
  });
  // All living recipients get the same rolled gold. Read one delta, never the party sum.
  const recipient = context.party.find(isAlive);
  context.party = grantRewards(context.party, defeated, rng);
  if (recipient) {
    const awarded = context.party.find((actor) => actor.id === recipient.id)!;
    if (Number.isFinite(recipient.gold) && Number.isFinite(awarded.gold)) {
      context.rewardGold += Math.max(0, awarded.gold - recipient.gold);
    }
  }
  context.loot.push(...defeated.flatMap((enemy) => rollLoot({ source: 'battle', level: enemy.level }, rng)));
  context.defeated.push(...defeated);
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

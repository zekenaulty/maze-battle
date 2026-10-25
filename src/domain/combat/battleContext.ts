import type { ActorState, BattleState, InventoryState, ItemStats } from '../types';
import { isAlive, refreshTimedSkills } from './combatant';
import type { CombatContext } from './applySkill';
import { grantRewards } from './rewards';
import type { Rng } from './rng';
import { rollLoot } from '../items/loot';
import { getEquipmentStats } from '../items/equipment';

// Kept local until the integration-owned BattleState exposes the optional save field.
export interface RewardedBattleState extends BattleState {
  rewardGold?: number;
}

export interface BattleCombatContext extends CombatContext {
  rewardGold: number;
}

export interface BattleFrame {
  party: readonly ActorState[];
  battle: Pick<BattleState, 'status' | 'enemies' | 'defeated' | 'log' | 'loot' | 'rewardGold'>;
  equipmentBonuses: Readonly<Record<string, ItemStats>>;
}

type LegacyCombatSource = { party: ActorState[]; battle?: BattleState; inventory: InventoryState };

export function battleRewardGold(battle: Pick<BattleState, 'status' | 'rewardGold'> | undefined) {
  const gold = battle?.rewardGold;
  return typeof gold === 'number' && Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
}

export function createCombatContext(game: LegacyCombatSource, rng: Rng, now = Date.now()): BattleCombatContext {
  const equipmentBonuses = Object.fromEntries(game.party.map(actor => [actor.id, getEquipmentStats(actor, game.inventory)]));
  return createContext(game.party, game.battle, equipmentBonuses, rng, now);
}

export function createBattleContext(frame: BattleFrame, rng: Rng, now: number): BattleCombatContext {
  return createContext(frame.party, frame.battle, frame.equipmentBonuses, rng, now);
}

function createContext(actors: readonly ActorState[], battle: BattleFrame['battle'] | undefined,
  bonuses: BattleFrame['equipmentBonuses'], rng: Rng, now: number): BattleCombatContext {
  const party = actors.map(copyActor), enemies = battle?.enemies.map(copyEnemy) ?? [];

  party.forEach((actor) => refreshTimedSkills(actor, now));
  enemies.forEach((enemy) => refreshTimedSkills(enemy, now));

  return {
    party,
    enemies,
    defeated: battle?.defeated?.map(copyEnemy) ?? [],
    log: [...(battle?.log ?? [])],
    loot: structuredClone(battle?.loot ?? []),
    rewardGold: battleRewardGold(battle),
    equipmentBonuses: Object.fromEntries(Object.entries(bonuses).map(([id, stats]) => [id, { ...stats }])),
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

function copyActor(actor: ActorState) {
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

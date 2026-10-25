import type { BattleState, GameState, SkillId } from '../types';
import { setGameMode } from '../gameFactory';
import type { BattleFrame, RewardedBattleState } from './battleContext';
import { executeBattleTurn, type BattleTurnResult } from './battleTurn';
import { defaultRng, type Rng } from './rng';
import { spawnEnemies } from './spawn';
import { addItemsToInventory, getEquipmentStats } from '../items/inventory';
import { recordKillQuestProgress } from '../quests/quests';
import { roomAtPosition } from '../quests/questTargets';
import { trackAutopilotCombat } from '../automation/autopilotCombat';
import { planningState } from '../automation/autopilotState';

export function startBattle(game: GameState, rng: Rng = defaultRng): GameState {
  if (game.battle?.status === 'active') return game;
  const wave = game.mode === 'waves' ? game.wave + 1 : 1;
  const battle: RewardedBattleState = {
    id: crypto.randomUUID(),
    wave,
    status: 'active',
    returnMode: game.mode === 'auto-play' || game.mode === 'waves' ? game.mode : 'manual',
    enemies: spawnEnemies(game.dungeonLevel, rng, game.monsterTags),
    round: 1,
    log: [`Battle ${wave} begins.`],
    loot: [],
    origin: battleOrigin(game),
    defeated: [],
    rewardGold: 0,
  };

  return {
    ...setGameMode(game, 'battle'),
    battle,
    autopilot: game.mode === 'auto-play'
      ? { ...(game.autopilot ?? planningState(game)), phase: 'combat', stalledTicks: 0, reason: 'Encounter started.' }
      : game.autopilot,
    updatedAt: new Date().toISOString(),
  };
}

export function setBattleReturnMode(game: GameState, returnMode: Exclude<GameState['mode'], 'battle'>): GameState {
  if (!game.battle) {
    return setGameMode(game, returnMode);
  }

  if (game.battle.returnMode === returnMode) {
    return game;
  }

  return {
    ...game,
    battle: {
      ...game.battle,
      returnMode,
    },
    autopilot: returnMode === 'auto-play'
      ? { ...(game.autopilot ?? planningState(game)), phase: 'combat', stalledTicks: 0, reason: 'Resumed automated combat.' }
      : game.autopilot,
    activityLog: trimLog([`Battle return mode set to ${returnMode}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function advanceBattleRound(game: GameState, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (game.battle?.status === 'lost') return game;
  if (!game.battle || game.battle.status !== 'active') {
    return startBattle(game, rng);
  }

  const turn = executeBattleTurn(battleFrame(game), { kind: 'round' }, rng, now);
  if (!turn.acted && turn.status === 'active') {
    return trackAutopilotCombat(game, game);
  }

  return trackAutopilotCombat(game, finishBattleTurn(game, turn));
}

export function useBattleSkill(game: GameState, actorId: string, skillId: SkillId, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (!game.battle || game.battle.status !== 'active') {
    return game;
  }

  const turn = executeBattleTurn(battleFrame(game), { kind: 'skill', actorId, skillId }, rng, now);
  return turn.acted ? trackAutopilotCombat(game, finishBattleTurn(game, turn)) : game;
}

export function endBattle(game: GameState): GameState {
  return {
    ...setGameMode(game, 'manual'),
    battle: undefined,
    updatedAt: new Date().toISOString(),
  };
}

function battleFrame(game: GameState): BattleFrame {
  return { party: game.party, battle: game.battle!,
    equipmentBonuses: Object.fromEntries(game.party.map(actor => [actor.id, getEquipmentStats(actor, game.inventory)])) };
}

function finishBattleTurn(game: GameState, { context, status, newlyDefeated }: BattleTurnResult): GameState {
  if (!game.battle) {
    return game;
  }

  const credited = recordKillQuestProgress(game, newlyDefeated, game.battle.origin ?? battleOrigin(game));

  if (status === 'won') {
    const won = {
      ...credited,
      mode: game.battle.returnMode ?? 'manual',
      wave: game.battle.returnMode === 'waves' ? game.battle.wave : game.wave,
      party: context.party,
      battle: undefined,
      inventory: { ...credited.inventory, gold: credited.inventory.gold + context.rewardGold },
      activityLog: trimLog(['Battle won.', ...(context.rewardGold > 0 ? [`Battle gold: ${context.rewardGold}g.`] : []), ...credited.activityLog]),
      updatedAt: new Date().toISOString(),
    };

    const withLoot = addItemsToInventory(won, context.loot, 'Battle loot');
    return {
      ...withLoot,
      activityLog: trimLog(['Battle won.', ...withLoot.activityLog.filter((entry) => entry !== 'Battle won.')]),
    };
  }

  const mode: GameState['mode'] = status === 'active' ? 'battle' : 'manual';
  const battle: RewardedBattleState = {
    ...game.battle,
    enemies: context.enemies,
    round: game.battle.round + 1,
    status,
    log: trimLog(status === 'lost' ? [...context.log, 'Party defeated.'] : context.log),
    loot: context.loot,
    origin: game.battle.origin ?? battleOrigin(game),
    defeated: context.defeated,
    rewardGold: context.rewardGold,
  };

  return {
    ...credited,
    mode,
    party: context.party,
    battle,
    updatedAt: new Date().toISOString(),
  };
}

function battleOrigin(game: GameState): NonNullable<BattleState['origin']> {
  return { floor: game.dungeonLevel, roomId: roomAtPosition(game)?.id, position: { ...game.maze.active } };
}

function trimLog(log: string[]) {
  return log.slice(-20);
}

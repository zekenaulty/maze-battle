import type { BattleState, GameState, SkillId } from '../types';
import { setGameMode } from '../gameFactory';
import { applySkill, type CombatContext } from './applySkill';
import { chooseEnemySkill, chooseHeroSkill } from './ai';
import { battleStatus, createCombatContext, removeDefeated, type BattleCombatContext, type RewardedBattleState } from './battleContext';
import { defaultRng, type Rng } from './rng';
import { spawnEnemies } from './spawn';
import { addItemsToInventory } from '../items/inventory';
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

  const context = createCombatContext(game, rng, now);
  let acted = false;

  for (const actor of context.party) {
    const skill = chooseHeroSkill(actor, context.party, context.enemies, rng, now);
    if (skill) {
      acted = applySkill(actor, skill, context) || acted;
    }
    acted = removeDefeated(context, rng) || acted;
  }

  acted = runEnemyTurn(context) || acted;

  const status = battleStatus(context);
  if (!acted && status === 'active') {
    return trackAutopilotCombat(game, game);
  }

  return trackAutopilotCombat(game, finishBattleTurn(game, context, status));
}

export function useBattleSkill(game: GameState, actorId: string, skillId: SkillId, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (!game.battle || game.battle.status !== 'active') {
    return game;
  }

  const context = createCombatContext(game, rng, now);
  const actor = context.party.find((item) => item.id === actorId);

  if (!actor || !applySkill(actor, skillId, context)) {
    return game;
  }

  removeDefeated(context, rng);
  if (context.enemies.length > 0) {
    runEnemyTurn(context);
  }

  const status = battleStatus(context);
  return trackAutopilotCombat(game, finishBattleTurn(game, context, status));
}

export function endBattle(game: GameState): GameState {
  return {
    ...setGameMode(game, 'manual'),
    battle: undefined,
    updatedAt: new Date().toISOString(),
  };
}

function runEnemyTurn(context: CombatContext) {
  if (context.enemies.length === 0) {
    return false;
  }

  let acted = false;
  for (const enemy of context.enemies) {
    const skill = chooseEnemySkill(enemy, context.rng, context.now);
    if (skill) {
      acted = applySkill(enemy, skill, context) || acted;
    }
  }

  return acted;
}

function finishBattleTurn(game: GameState, context: BattleCombatContext, status: BattleState['status']): GameState {
  if (!game.battle) {
    return game;
  }

  // The saved cumulative list is the delta boundary, including after a save/resume.
  const previousDefeated = new Set(game.battle.defeated?.map((enemy) => enemy.id) ?? []);
  const credited = recordKillQuestProgress(game, context.defeated.filter((enemy) => !previousDefeated.has(enemy.id)), game.battle.origin ?? battleOrigin(game));

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

import type { BattleState, GameState, SkillId } from '../types';
import { setGameMode } from '../gameFactory';
import { applySkill, type CombatContext } from './applySkill';
import { chooseEnemySkill, chooseHeroSkill } from './ai';
import { battleStatus, createCombatContext, removeDefeated } from './battleContext';
import { defaultRng, type Rng } from './rng';
import { spawnEnemies } from './spawn';
import { addItemsToInventory } from '../items/inventory';
import { recordKillQuestProgress } from '../quests/quests';

export function startBattle(game: GameState, rng: Rng = defaultRng): GameState {
  const wave = game.mode === 'waves' ? game.wave + 1 : 1;
  const battle: BattleState = {
    id: crypto.randomUUID(),
    wave,
    status: 'active',
    returnMode: game.mode === 'auto-play' || game.mode === 'waves' ? game.mode : 'manual',
    enemies: spawnEnemies(game.dungeonLevel, rng, game.monsterTags),
    round: 1,
    log: [`Battle ${wave} begins.`],
    loot: [],
  };

  return {
    ...setGameMode(game, 'battle'),
    battle,
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
    activityLog: trimLog([`Battle return mode set to ${returnMode}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function advanceBattleRound(game: GameState, rng: Rng = defaultRng, now = Date.now()): GameState {
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
    return game;
  }

  return finishBattleTurn(game, context, status);
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
  return finishBattleTurn(game, context, status);
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

function finishBattleTurn(game: GameState, context: CombatContext, status: BattleState['status']): GameState {
  if (!game.battle) {
    return game;
  }

  if (status === 'won') {
    const won = {
      ...game,
      mode: game.battle.returnMode ?? 'manual',
      wave: game.battle.returnMode === 'waves' ? game.battle.wave : game.wave,
      party: context.party,
      battle: undefined,
      activityLog: trimLog(['Battle won.', ...game.activityLog]),
      updatedAt: new Date().toISOString(),
    };

    const withQuestProgress = recordKillQuestProgress(won, context.defeated);
    const withLoot = addItemsToInventory(withQuestProgress, context.loot, 'Battle loot');
    return {
      ...withLoot,
      activityLog: trimLog(['Battle won.', ...withLoot.activityLog.filter((entry) => entry !== 'Battle won.')]),
    };
  }

  const mode: GameState['mode'] = status === 'active' ? 'battle' : 'manual';

  return {
    ...game,
    mode,
    party: context.party,
    battle: {
      ...game.battle,
      enemies: context.enemies,
      round: game.battle.round + 1,
      status,
      log: trimLog(status === 'lost' ? [...context.log, 'Party defeated.'] : context.log),
      loot: context.loot,
    },
    updatedAt: new Date().toISOString(),
  };
}

function trimLog(log: string[]) {
  return log.slice(-20);
}

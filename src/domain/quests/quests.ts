import type { BattleState, EnemyState, GameState, GridPosition, MazeRoomState, QuestState } from '../types';
import { guildContractsForFloor } from '../guild/contracts';
import { cellKey } from '../maze/key';
import { createMazeVisibilitySnapshot } from '../maze/visibility';
import { isInRoom } from './questTargets';
import { ownedQuestItemCount } from './questItems';
import { advanceQuestProgress, claimQuest, questFromContract } from './questRules';

export function acceptGuildContract(game: GameState, contractId: string): GameState {
  if (game.quests.some((quest) => quest.id === contractId)) {
    return game;
  }

  const contract = guildContractsForFloor(game).find((item) => item.id === contractId);
  if (!contract) {
    return game;
  }

  const quest = questFromContract(contract, new Date().toISOString());
  const withQuest = {
    ...game,
    quests: [...game.quests, quest],
    activityLog: trimLog([`Accepted quest: ${quest.title}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };

  return updateQuestProgress(withQuest);
}

/** Auto's deliberate guild policy. Do not call from movement, loading or effect recording. */
export function syncGuildQuests(game: GameState): GameState {
  return claimCompletedGuildQuests(updateQuestProgress(autoAcceptGuildContracts(game)));
}

export function updateQuestProgress(game: GameState): GameState {
  let changed = false;
  const completedTitles: string[] = [];
  const quests = game.quests.map((quest) => {
    if (quest.status !== 'active' || quest.floor !== game.dungeonLevel) {
      return quest;
    }

    const progress = progressForQuest(game, quest);
    const nextQuest = advanceQuestProgress(quest, progress, new Date().toISOString());
    if (nextQuest === quest) return quest;
    changed = true;
    if (nextQuest.status === 'complete') {
      completedTitles.push(nextQuest.title);
    }

    return nextQuest;
  });

  if (!changed) {
    return game;
  }

  return {
    ...game,
    quests,
    activityLog: trimLog([...completedTitles.map((title) => `Quest complete: ${title}.`), ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function recordFetchQuestProgress(game: GameState, position: GridPosition): GameState {
  if (!game.chests.some((chest) => chest.level === game.dungeonLevel && chest.opened && cellKey(chest.position) === cellKey(position))) return game;
  const next = updateMatchingQuestProgress(game, (quest) => {
    if (quest.task.objective !== 'fetch' || quest.floor !== game.dungeonLevel) {
      return quest.task.progress;
    }

    if (quest.task.item) return ownedQuestItemCount(game, quest);
    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    return room && isInRoom(position, room) ? quest.task.required : quest.task.progress;
  });

  return next;
}

export function recordKillQuestProgress(game: GameState, defeated: EnemyState[], origin?: BattleState['origin']): GameState {
  if (defeated.length === 0 || !origin) {
    return game;
  }

  const next = updateMatchingQuestProgress(game, (quest) => {
    if (quest.task.objective !== 'kill' || quest.floor !== origin.floor) {
      return quest.task.progress;
    }

    const maze = origin.floor === game.dungeonLevel ? game.maze : game.floors.find((floor) => floor.level === origin.floor)?.maze;
    const room = maze?.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    if (!room || (origin.roomId ? origin.roomId !== room.id : !isInRoom(origin.position, room))) return quest.task.progress;
    const matching = new Set(defeated.filter((enemy) => enemy.hp <= 0 &&
      (!quest.task.monsterTags?.length || quest.task.monsterTags.some((tag) => enemy.tags.includes(tag)))).map((enemy) => enemy.id));
    return quest.task.progress + matching.size;
  });

  return next;
}

export function claimGuildQuestReward(game: GameState, questId: string): GameState {
  const quest = game.quests.find((item) => item.id === questId);
  const claimedAt = new Date().toISOString();
  const claim = quest && claimQuest(quest, claimedAt);
  if (!claim) {
    return game;
  }

  return {
    ...game,
    inventory: {
      ...game.inventory,
      gold: game.inventory.gold + claim.gold,
    },
    quests: game.quests.map((item) => (item.id === claim.quest.id ? { ...item, status: claim.quest.status, claimedAt } : item)),
    activityLog: trimLog([`Claimed ${claim.gold}g for ${claim.quest.title}.`, ...game.activityLog]),
    updatedAt: claimedAt,
  };
}

function autoAcceptGuildContracts(game: GameState): GameState {
  const acceptedIds = new Set(game.quests.map((quest) => quest.id));
  const contracts = guildContractsForFloor(game, acceptedIds);
  if (contracts.length === 0) {
    return game;
  }

  const quests = contracts.map((contract) => questFromContract(contract, new Date().toISOString()));
  return {
    ...game,
    quests: [...game.quests, ...quests],
    activityLog: trimLog([`Guild auto accepted ${quests.length} contract${quests.length === 1 ? '' : 's'}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

function claimCompletedGuildQuests(game: GameState): GameState {
  const claimedAt = new Date().toISOString();
  const completed = game.quests.flatMap((quest) => {
    const claim = claimQuest(quest, claimedAt);
    return claim ? [claim] : [];
  });
  if (completed.length === 0) {
    return game;
  }

  const gold = completed.reduce((total, claim) => total + claim.gold, 0);
  const completedById = new Map(completed.map((claim) => [claim.quest.id, claim.quest]));

  return {
    ...game,
    inventory: {
      ...game.inventory,
      gold: game.inventory.gold + gold,
    },
    quests: game.quests.map((quest) => {
      const claimed = completedById.get(quest.id);
      return claimed ? { ...quest, status: claimed.status, claimedAt: claimed.claimedAt } : quest;
    }),
    activityLog: trimLog([`Guild paid ${gold}g for ${completed.length} completed quest${completed.length === 1 ? '' : 's'}.`, ...game.activityLog]),
    updatedAt: claimedAt,
  };
}

function progressForQuest(game: GameState, quest: QuestState) {
  if (quest.task.objective === 'fetch' && quest.task.item) return ownedQuestItemCount(game, quest);
  const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
  if (!room) {
    return quest.task.progress;
  }

  switch (quest.task.objective) {
    case 'locate':
      return hasLocatedRoom(game, room) ? quest.task.required : quest.task.progress;
    case 'scout':
      return isInRoom(game.maze.active, room) ? quest.task.required : quest.task.progress;
    case 'fetch':
      return game.chests.some((chest) => chest.level === quest.floor && chest.opened && isInRoom(chest.position, room))
        ? quest.task.required : quest.task.progress;
    case 'kill':
      return quest.task.progress;
  }
}

function updateMatchingQuestProgress(game: GameState, progressFor: (quest: QuestState) => number): GameState {
  let changed = false;
  const completedTitles: string[] = [];
  const quests = game.quests.map((quest) => {
    if (quest.status !== 'active') {
      return quest;
    }

    const progress = progressFor(quest);
    const nextQuest = advanceQuestProgress(quest, progress, new Date().toISOString(), 'event');
    if (nextQuest === quest) return quest;
    changed = true;
    if (nextQuest.status === 'complete') {
      completedTitles.push(nextQuest.title);
    }

    return nextQuest;
  });

  if (!changed) {
    return game;
  }

  return {
    ...game,
    quests,
    activityLog: trimLog([...completedTitles.map((title) => `Quest complete: ${title}.`), ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

function hasLocatedRoom(game: GameState, room: MazeRoomState) {
  if (isInRoom(game.maze.active, room)) {
    return true;
  }

  const visibility = createMazeVisibilitySnapshot(game.maze);
  const key = cellKey(room.center);
  return visibility.visible.has(key) || visibility.explored.has(key);
}

function trimLog(entries: string[]) {
  return entries.slice(0, 12);
}

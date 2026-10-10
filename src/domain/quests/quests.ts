import type { BattleState, EnemyState, GameState, GridPosition, MazeRoomState, QuestState } from '../types';
import { guildContractsForFloor, type GuildContract } from '../guild/contracts';
import { cellKey } from '../maze/key';
import { createMazeVisibilitySnapshot } from '../maze/visibility';
import { isInRoom } from './questTargets';

export function acceptGuildContract(game: GameState, contractId: string): GameState {
  if (game.quests.some((quest) => quest.id === contractId)) {
    return game;
  }

  const contract = guildContractsForFloor(game).find((item) => item.id === contractId);
  if (!contract) {
    return game;
  }

  const quest = questFromContract(contract);
  const withQuest = {
    ...game,
    quests: [...game.quests, quest],
    activityLog: trimLog([`Accepted quest: ${quest.title}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };

  return updateQuestProgress(withQuest);
}

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
    if (progress <= quest.task.progress && progress < quest.task.required) {
      return quest;
    }

    changed = true;
    const required = Math.max(1, quest.task.required);
    const nextQuest: QuestState = {
      ...quest,
      task: {
        ...quest.task,
        progress: Math.min(required, progress),
      },
    };

    if (nextQuest.task.progress >= required) {
      completedTitles.push(nextQuest.title);
      const completedQuest: QuestState = {
        ...nextQuest,
        status: 'complete',
        completedAt: new Date().toISOString(),
      };
      return completedQuest;
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

    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    return room && isInRoom(position, room) ? quest.task.required : quest.task.progress;
  });

  return claimCompletedGuildQuests(next);
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

  return claimCompletedGuildQuests(next);
}

export function claimGuildQuestReward(game: GameState, questId: string): GameState {
  const quest = game.quests.find((item) => item.id === questId);
  if (!quest || quest.source !== 'guild' || quest.status !== 'complete') {
    return game;
  }

  const claimedAt = new Date().toISOString();
  return {
    ...game,
    inventory: {
      ...game.inventory,
      gold: game.inventory.gold + quest.reward.gold,
    },
    quests: game.quests.map((item) => (item.id === quest.id ? { ...item, status: 'claimed', claimedAt } : item)),
    activityLog: trimLog([`Claimed ${quest.reward.gold}g for ${quest.title}.`, ...game.activityLog]),
    updatedAt: claimedAt,
  };
}

function autoAcceptGuildContracts(game: GameState): GameState {
  const acceptedIds = new Set(game.quests.map((quest) => quest.id));
  const contracts = guildContractsForFloor(game).filter((contract) => !acceptedIds.has(contract.id));
  if (contracts.length === 0) {
    return game;
  }

  const quests = contracts.map(questFromContract);
  return {
    ...game,
    quests: [...game.quests, ...quests],
    activityLog: trimLog([`Guild auto accepted ${quests.length} contract${quests.length === 1 ? '' : 's'}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

function claimCompletedGuildQuests(game: GameState): GameState {
  const completed = game.quests.filter((quest) => quest.source === 'guild' && quest.status === 'complete');
  if (completed.length === 0) {
    return game;
  }

  const gold = completed.reduce((total, quest) => total + quest.reward.gold, 0);
  const claimedAt = new Date().toISOString();
  const completedIds = new Set(completed.map((quest) => quest.id));

  return {
    ...game,
    inventory: {
      ...game.inventory,
      gold: game.inventory.gold + gold,
    },
    quests: game.quests.map((quest) => (completedIds.has(quest.id) ? { ...quest, status: 'claimed', claimedAt } : quest)),
    activityLog: trimLog([`Guild paid ${gold}g for ${completed.length} completed quest${completed.length === 1 ? '' : 's'}.`, ...game.activityLog]),
    updatedAt: claimedAt,
  };
}

function questFromContract(contract: GuildContract): QuestState {
  return {
    id: contract.id,
    source: 'guild',
    floor: contract.floor,
    originRoomId: contract.originRoomId,
    targetRoomId: contract.targetRoomId,
    targetRoomName: contract.targetRoomName,
    targetRoomKind: contract.targetRoomKind,
    title: contract.title,
    description: contract.description,
    task: {
      ...contract.task,
      progress: 0,
    },
    reward: {
      gold: contract.rewardGold,
    },
    status: 'active',
    acceptedAt: new Date().toISOString(),
  };
}

function progressForQuest(game: GameState, quest: QuestState) {
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
    if (progress <= quest.task.progress) {
      return quest;
    }

    changed = true;
    const required = Math.max(1, quest.task.required);
    const nextQuest: QuestState = {
      ...quest,
      task: {
        ...quest.task,
        progress: Math.min(required, progress),
      },
    };

    if (nextQuest.task.progress >= required) {
      completedTitles.push(nextQuest.title);
      return {
        ...nextQuest,
        status: 'complete',
        completedAt: new Date().toISOString(),
      } satisfies QuestState;
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

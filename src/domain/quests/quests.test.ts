import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { guildContractsForFloor } from '../guild/contracts';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import { revealMazeVisibility } from '../maze/visibility';
import type { EnemyState } from '../types';
import { acceptGuildContract, claimGuildQuestReward, recordFetchQuestProgress, recordKillQuestProgress, syncGuildQuests, updateQuestProgress } from './quests';
import { chestAt, lineMaze, questFor, roomAt } from '../automation/autopilotTestFixtures';

describe('guild quest lifecycle', () => {
  it('auto accepts generated guild contracts into persistent quest state', () => {
    const game = createNewGameState({ dungeonLevel: 2, maze: generateStructuredMaze(32, 36, constantRng) });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'fetch');
    const quest = game.quests.find((item) => item.id === contract?.id);

    expect(contract).toBeDefined();
    expect(quest).toMatchObject({
      id: contract!.id,
      source: 'guild',
      status: 'active',
      reward: { gold: contract!.rewardGold },
      task: { objective: 'fetch', progress: 0, required: 1 },
    });
  });

  it('auto completes and claims a locate quest when its target room is already visible', () => {
    const maze = generateStructuredMaze(9, 13, constantRng);
    const game = createNewGameState({
      maze: revealMazeVisibility({
        ...maze,
        active: maze.end,
        visited: [...maze.visited, maze.end],
      }),
    });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'locate');
    const quest = game.quests.find((item) => item.id === contract?.id);

    expect(contract).toBeDefined();
    expect(quest).toMatchObject({ status: 'claimed', task: { progress: 1 } });
    expect(game.inventory.gold).toBeGreaterThan(35);
  });

  it('completes scout quests when the party enters the target room', () => {
    const maze = generateStructuredMaze(42, 46, constantRng);
    const game = createNewGameState({ maze });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'scout' && item.targetRoomKind === 'safe');

    expect(contract).toBeDefined();
    const targetRoom = game.maze.layout!.rooms.find((room) => room.id === contract!.targetRoomId)!;
    const completed = updateQuestProgress({
      ...game,
      maze: revealMazeVisibility({
        ...game.maze,
        active: targetRoom.center,
        visited: [...game.maze.visited, targetRoom.center],
      }),
    });
    const quest = completed.quests.find((item) => item.id === contract!.id);

    expect(quest).toMatchObject({
      status: 'complete',
      task: { objective: 'scout', progress: 1 },
    });
    expect(completed.activityLog[0]).toBe(`Quest complete: ${contract!.title}.`);
  });

  it('auto claims fetch quests when a chest opens in the target room', () => {
    const maze = generateStructuredMaze(42, 46, constantRng);
    const game = createNewGameState({ maze });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'fetch');
    const targetRoom = game.maze.layout!.rooms.find((room) => room.id === contract!.targetRoomId)!;

    expect(contract).toBeDefined();
    const opened = { ...game, chests: game.chests.map((chest) => ({ ...chest, opened: true })) };
    const completed = recordFetchQuestProgress(opened, targetRoom.center);
    const quest = completed.quests.find((item) => item.id === contract!.id);

    expect(quest).toMatchObject({ status: 'claimed', task: { objective: 'fetch', progress: 1 } });
    expect(completed.inventory.gold).toBe(game.inventory.gold + contract!.rewardGold);
  });

  it('auto claims kill quests after enough enemies are defeated', () => {
    const maze = generateStructuredMaze(42, 46, constantRng);
    const game = createNewGameState({ maze });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'kill');

    expect(contract).toBeDefined();
    const room = game.maze.layout!.rooms.find((room) => room.id === contract!.targetRoomId)!;
    const completed = recordKillQuestProgress(game, [enemy('a'), enemy('b'), enemy('c')], { floor: 1, roomId: room.id, position: room.center });
    const quest = completed.quests.find((item) => item.id === contract!.id);

    expect(quest).toMatchObject({ status: 'claimed', task: { objective: 'kill', progress: 3 } });
    expect(completed.inventory.gold).toBe(game.inventory.gold + contract!.rewardGold);
  });

  it('requires battle origin and filters floor, room, living enemies, duplicate ids and monster tags', () => {
    const boss = roomAt('boss', 'boss', 1);
    const other = roomAt('other', 'boss', 2);
    const base = createNewGameState({ maze: lineMaze(4, [boss, other]) });
    const quest = questFor(boss, 'kill', 3);
    quest.task.monsterTags = ['beast'];
    const game = { ...base, quests: [quest, questFor(other, 'kill', 3)] };
    const origin = { floor: 1, roomId: boss.id, position: boss.center };
    expect(recordKillQuestProgress(game, [enemy('a')])).toBe(game);
    expect(recordKillQuestProgress(game, [enemy('a')], { ...origin, floor: 2 })).toBe(game);
    expect(recordKillQuestProgress(game, [enemy('a')], { ...origin, roomId: 'unknown' })).toBe(game);
    const credited = recordKillQuestProgress(game, [enemy('a'), enemy('a'), { ...enemy('b'), tags: ['undead'] }, { ...enemy('c'), hp: 1 }], origin);
    expect(credited.quests.map((item) => item.task.progress)).toEqual([1, 0]);
  });

  it('reconciles already opened fetch caches and repeats acceptance/claim without another reward', () => {
    const hub = roomAt('hub', 'hub', 0);
    const treasure = roomAt('treasure', 'treasure', 2);
    const game = createNewGameState({ maze: lineMaze(4, [hub, treasure]), chests: [chestAt(2)] });
    const id = game.quests.find((item) => item.task.objective === 'fetch')!.id;
    expect(acceptGuildContract(game, id)).toBe(game);
    expect(recordFetchQuestProgress(game, treasure.center)).toBe(game);
    const completed = syncGuildQuests({ ...game, chests: [chestAt(2, true)] });
    expect(completed.quests.find((item) => item.id === id)?.status).toBe('claimed');
    expect(syncGuildQuests(completed)).toBe(completed);
    expect(claimGuildQuestReward(completed, id)).toBe(completed);
    expect(acceptGuildContract(completed, id)).toBe(completed);
  });
});

function constantRng() {
  return 0.42;
}

function enemy(id: string): EnemyState {
  return {
    id,
    monsterId: 'test-beast',
    displayName: 'Test Beast',
    token: '!',
    tags: ['beast'],
    level: 1,
    hp: 0,
    maxHp: 1,
    mp: 0,
    maxMp: 0,
    attributes: { strength: 1, vitality: 1, intellect: 0, available: 0 },
    combat: { baseDamage: 1, scaleWith: 'strength' },
    skills: [{ id: 'attack', cooldown: 0 }],
  };
}

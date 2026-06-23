import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { guildContractsForFloor } from '../guild/contracts';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import { revealMazeVisibility } from '../maze/visibility';
import type { EnemyState } from '../types';
import { recordFetchQuestProgress, recordKillQuestProgress, updateQuestProgress } from './quests';

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
    const completed = recordFetchQuestProgress(game, targetRoom.center);
    const quest = completed.quests.find((item) => item.id === contract!.id);

    expect(quest).toMatchObject({ status: 'claimed', task: { objective: 'fetch', progress: 1 } });
    expect(completed.inventory.gold).toBe(game.inventory.gold + contract!.rewardGold);
  });

  it('auto claims kill quests after enough enemies are defeated', () => {
    const maze = generateStructuredMaze(42, 46, constantRng);
    const game = createNewGameState({ maze });
    const contract = guildContractsForFloor(game).find((item) => item.objective === 'kill');

    expect(contract).toBeDefined();
    const completed = recordKillQuestProgress(game, [enemy('a'), enemy('b'), enemy('c')]);
    const quest = completed.quests.find((item) => item.id === contract!.id);

    expect(quest).toMatchObject({ status: 'claimed', task: { objective: 'kill', progress: 3 } });
    expect(completed.inventory.gold).toBe(game.inventory.gold + contract!.rewardGold);
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

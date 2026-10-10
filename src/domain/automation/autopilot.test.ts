import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import type { ChestState, Direction, GameState, MazeRoomKind, MazeRoomState, MazeState, QuestObjective, QuestState } from '../types';
import { nextAutoIntent } from './autopilot';

describe('autopilot behavior tree', () => {
  it('targets unopened chests before the descent stairs', () => {
    const game = {
      ...createNewGameState({ maze: lineMaze(3), chests: [chest('chest-a', 1)], quests: [] }),
      quests: [],
    };

    const intent = nextAutoIntent(game);

    expect(intent.type).toBe('move');
    if (intent.type === 'move') {
      expect(intent.direction).toBe('east');
      expect(intent.plan.target.kind).toBe('chest');
    }
  });

  it('targets active quest rooms before unrelated chests', () => {
    const room = roomAt('safe-1', 'safe', 1);
    const game = withQuests(
      createNewGameState({ maze: lineMaze(4, 0, 3, [room]), chests: [chest('far-chest', 3)] }),
      [quest('quest-scout', 'scout', room)],
    );

    const intent = nextAutoIntent(game);

    expect(intent.type).toBe('move');
    if (intent.type === 'move') {
      expect(intent.plan.target.kind).toBe('quest-scout');
      expect(intent.plan.target.questId).toBe('quest-scout');
    }
  });

  it('batches chests that are effectively on the path to a quest objective', () => {
    const room = roomAt('safe-1', 'safe', 3);
    const game = withQuests(
      createNewGameState({ maze: lineMaze(4, 0, 3, [room]), chests: [chest('path-chest', 2)] }),
      [quest('quest-scout', 'scout', room)],
    );

    const intent = nextAutoIntent(game);

    expect(intent.type).toBe('move');
    if (intent.type === 'move') {
      expect(intent.plan.target.kind).toBe('chest');
      expect(intent.plan.target.chestId).toBe('path-chest');
    }
  });

  it('starts battle when standing in an active kill quest room', () => {
    const room = roomAt('boss-1', 'boss', 1);
    const game = withQuests(
      createNewGameState({ maze: lineMaze(3, 1, 2, [room]), chests: [] }),
      [quest('quest-kill', 'kill', room, 3)],
    );

    const intent = nextAutoIntent(game);

    expect(intent.type).toBe('battle');
    if (intent.type === 'battle') {
      expect(intent.quest.id).toBe('quest-kill');
    }
  });

  it('uses the exit only after current floor work is clear', () => {
    const game = {
      ...createNewGameState({ maze: lineMaze(3), chests: [], quests: [] }),
      chests: [],
      quests: [],
    };

    const intent = nextAutoIntent(game);

    expect(intent.type).toBe('move');
    if (intent.type === 'move') {
      expect(intent.plan.target.kind).toBe('exit');
      expect(intent.direction).toBe('east');
    }
  });
});

function withQuests(game: GameState, quests: QuestState[]): GameState {
  return { ...game, quests };
}

function lineMaze(columns: number, activeColumn = 0, endColumn = columns - 1, rooms: MazeRoomState[] = []): MazeState {
  return {
    rows: 1,
    columns,
    start: { row: 0, column: 0 },
    end: { row: 0, column: endColumn },
    active: { row: 0, column: activeColumn },
    visited: [{ row: 0, column: activeColumn }],
    layout: rooms.length > 0 ? { version: 'structured-v1', rooms, mainPath: [], zones: [] } : undefined,
    cells: Array.from({ length: columns }, (_, column) => {
      const links: Direction[] = [];
      if (column > 0) links.push('west');
      if (column < columns - 1) links.push('east');
      return { row: 0, column, links };
    }),
  };
}

function roomAt(id: string, kind: MazeRoomKind, column: number): MazeRoomState {
  return {
    id,
    kind,
    name: id,
    row: 0,
    column,
    rows: 1,
    columns: 1,
    center: { row: 0, column },
    tags: ['questRelevant'],
  };
}

function chest(id: string, column: number): ChestState {
  return {
    id,
    level: 1,
    position: { row: 0, column },
    opened: false,
  };
}

function quest(id: string, objective: QuestObjective, room: MazeRoomState, required = 1): QuestState {
  return {
    id,
    source: 'guild',
    floor: 1,
    originRoomId: 'hub-0',
    targetRoomId: room.id,
    targetRoomName: room.name,
    targetRoomKind: room.kind,
    title: id,
    description: id,
    task: { objective, noun: room.name, required, progress: 0 },
    reward: { gold: 10 },
    status: 'active',
    acceptedAt: '2026-06-23T00:00:00.000Z',
  };
}

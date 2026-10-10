import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import type { MazeState } from '../types';
import { guildContractsForFloor } from './contracts';
import { chestAt, lineMaze, roomAt } from '../automation/autopilotTestFixtures';

describe('guildContractsForFloor', () => {
  it('posts contracts from structured room anchors', () => {
    const maze = generateStructuredMaze(42, 46, constantRng);
    const game = createNewGameState({ dungeonLevel: 3, maze });
    const contracts = guildContractsForFloor(game);

    expect(contracts.length).toBeGreaterThan(1);
    expect(contracts.some((contract) => contract.objective === 'fetch')).toBe(true);
    expect(contracts.some((contract) => contract.objective === 'kill')).toBe(true);
    expect(contracts.some((contract) => contract.objective === 'locate')).toBe(true);
    expect(contracts.every((contract) => contract.originRoomId.includes('hub'))).toBe(true);
    expect(contracts.every((contract) => contract.floor === 3)).toBe(true);
    expect(contracts.every((contract) => contract.task.required > 0)).toBe(true);
  });

  it('marks visible or explored room anchors as located work', () => {
    const maze = generateStructuredMaze(9, 13, constantRng);
    const game = createNewGameState({
      maze: {
        ...maze,
        active: maze.end,
        visited: [...maze.visited, maze.end],
      },
    });
    const contracts = guildContractsForFloor(game);

    expect(contracts.find((contract) => contract.targetRoomKind === 'exit')?.status).toBe('nearby');
  });

  it('does not invent contracts for legacy mazes without room metadata', () => {
    const game = createNewGameState({ maze: legacyMaze() });

    expect(guildContractsForFloor(game)).toEqual([]);
  });

  it('only posts fetch contracts for a reachable chest in that room on this floor', () => {
    const hub = roomAt('hub', 'hub', 0);
    const treasure = roomAt('treasure', 'treasure', 2);
    const base = createNewGameState({ maze: lineMaze(4, [hub, treasure]), chests: [chestAt(2)] });
    const fetch = (game: typeof base) => guildContractsForFloor(game).filter((contract) => contract.objective === 'fetch');
    expect(fetch(base)).toHaveLength(1);
    expect(fetch({ ...base, chests: [] })).toHaveLength(0);
    expect(fetch({ ...base, chests: [{ ...chestAt(2), level: 2 }] })).toHaveLength(0);
    const isolated = { ...base.maze, cells: base.maze.cells.map((cell) => ({ ...cell, links: [] })) };
    expect(fetch({ ...base, maze: isolated })).toHaveLength(0);
    expect(fetch({ ...base, chests: [chestAt(2, true)] })).toHaveLength(1);
  });
});

function legacyMaze(): MazeState {
  return {
    rows: 1,
    columns: 2,
    start: { row: 0, column: 0 },
    end: { row: 0, column: 1 },
    active: { row: 0, column: 0 },
    visited: [{ row: 0, column: 0 }],
    cells: [
      { row: 0, column: 0, links: ['east'] },
      { row: 0, column: 1, links: ['west'] },
    ],
  };
}

function constantRng() {
  return 0.42;
}

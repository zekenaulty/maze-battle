import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import type { MazeState } from '../types';
import { guildContractsForFloor } from './contracts';

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

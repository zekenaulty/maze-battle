import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { guildContractsForFloor } from '../guild/contracts';
import { generateModuleMaze } from './moduleGenerate';
import { createModuleRecipe } from '../expedition/topology/modules/policy';
import { mazeCellAt } from './movement';
import { computeVisibleCells } from './visibility';

describe('bounded local cell lookups', () => {
  const maze = generateModuleMaze(createModuleRecipe('lookup', 1, 42));

  it('preserves visibility and lookup on row-major, reordered and sparse saves', () => {
    const variants = [maze.cells, [...maze.cells].reverse(), maze.cells.filter(cell => cell.links.length)];
    const expected = computeVisibleCells(maze);
    for (const cells of variants) {
      const current = { ...maze, cells };
      expect(computeVisibleCells(current)).toEqual(expected);
      for (const cell of cells) expect(mazeCellAt(current, cell)).toBe(cell);
    }
  });

  it('uses only local dense coordinates without scanning the full envelope', () => {
    const cells = [...maze.cells];
    cells.find = () => { throw new Error('Unexpected full-floor scan'); };
    expect(computeVisibleCells({ ...maze, cells })).toEqual(computeVisibleCells(maze));
  });

  it('does not retain stale topology after replacements or in-place link changes', () => {
    const current = structuredClone(maze);
    expect(computeVisibleCells(current).length).toBeGreaterThan(1);
    mazeCellAt(current, current.active)!.links = [];
    expect(computeVisibleCells(current)).toEqual([current.active]);
    current.cells = structuredClone(maze.cells);
    expect(computeVisibleCells(current)).toEqual(computeVisibleCells(maze));
  });

  it('does not recompute routes or visibility for already accepted contracts', () => {
    const game = createNewGameState({ maze });
    const contracts = guildContractsForFloor(game);
    expect(contracts.length).toBeGreaterThan(0);
    const accepted = new Set(contracts.map(contract => contract.id));
    Object.defineProperty(game.maze, 'cells', { get() { throw new Error('Unnecessary topology read'); } });
    expect(guildContractsForFloor(game, accepted)).toEqual([]);
  });

  it('keeps unaccepted contracts identical to the full board projection', () => {
    const game = createNewGameState({ maze });
    const contracts = guildContractsForFloor(game);
    const accepted = new Set([contracts[0].id]);
    expect(guildContractsForFloor(game, accepted)).toEqual(contracts.slice(1));
  });
});

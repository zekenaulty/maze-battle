import { describe, expect, it } from 'vitest';
import { createModuleRecipe } from '../expedition/topology/modules/policy';
import { createNewGameState, moveActive, normalizeGameState } from '../gameFactory';
import { generateModuleMaze } from './moduleGenerate';
import { generateStructuredMaze } from './structuredGenerate';
import { createMazePathSearch, findPath } from './solver';
import { movePosition, opposite } from './movement';
import { cellKey } from './key';
import { shouldStartEncounter } from '../combat/encounters';
import { isMazeFloorCell } from '../../components/maze/mazeFloor';
import { leaveTown, useTownPortal } from '../town/town';

describe('D1 ordinary RPG module projection', () => {
  it.each([1, 10, 60])('projects floor %i with reachable objectives, reciprocal doors and bounded content', level => {
    const recipe = createModuleRecipe('rpg-test', level, 42);
    const maze = generateModuleMaze(recipe);
    expect(maze).toEqual(generateModuleMaze(recipe));
    const game = createNewGameState({ id: 'rpg-test', dungeonLevel: level, maze });
    const search = createMazePathSearch(game.maze);
    const cells = new Map(maze.cells.map(cell => [cellKey(cell), cell]));
    expect(search.visitedCount).toBe(maze.cells.filter(cell => cell.links.length).length);
    for (const cell of maze.cells) for (const direction of cell.links) {
      expect(cells.get(cellKey(movePosition(cell, direction)))?.links).toContain(opposite(direction));
    }
    for (const room of maze.layout!.rooms) expect(search.distanceTo(room.center)).toBeLessThan(Infinity);
    for (const chest of game.chests) expect(search.distanceTo(chest.position)).toBeLessThan(Infinity);
    expect(game.chests.length).toBeLessThanOrEqual(3);
    expect(game.quests.length).toBeLessThanOrEqual(6);
    expect(game.maze.layout?.rooms).toHaveLength(6 + 2 * level);
    expect(game.maze.cells.length).toBeLessThanOrEqual(65_536);
    expect(game.maze.cells.some(cell => !isMazeFloorCell(maze, cell))).toBe(true);
    expect(shouldStartEncounter(game, () => 0)).toBe(false);
    const unsafe = maze.layout!.rooms.find(room => room.kind === 'boss')!;
    expect(shouldStartEncounter({ ...game, maze: { ...maze, active: unsafe.center } }, () => 0)).toBe(true);
    const roundTrip = normalizeGameState(JSON.parse(JSON.stringify(game)));
    expect(roundTrip.maze).toEqual(game.maze);
    expect(roundTrip.chests).toEqual(game.chests);
    expect(roundTrip.quests).toEqual(game.quests);
  });

  it('uses modules for a fresh game and an unseen descent, but preserves archived legacy floors', () => {
    expect(createNewGameState().maze.layout?.version).toBe('structured-v3');
    const legacy = generateStructuredMaze(9, 13, () => 0.42);
    const route = findPath(legacy, legacy.end)!.directions;
    let game = createNewGameState({ maze: legacy, randomBattles: false });
    for (const direction of route) game = moveActive(game, direction);
    expect(game.dungeonLevel).toBe(2);
    expect(game.maze.layout?.version).toBe('structured-v3');
    expect(game.floors.find(floor => floor.level === 1)?.maze.cells).toEqual(legacy.cells);
    const generated = game.maze;
    const offStairs = game.maze.cells.find(cell => cellKey(cell) === cellKey(game.maze.start))!.links[0];
    game = moveActive(moveActive(game, offStairs), opposite(offStairs));
    expect(game.dungeonLevel).toBe(1);
    expect(game.maze.layout).toEqual(legacy.layout);
    expect(game.maze.active).toEqual(legacy.end);
    const beforeEnd = opposite(route[route.length - 1]);
    game = moveActive(moveActive(game, beforeEnd), opposite(beforeEnd));
    expect(game.dungeonLevel).toBe(2);
    expect(game.maze.layout).toEqual(generated.layout);
    expect(game.maze.cells).toEqual(generated.cells);
    game = normalizeGameState(JSON.parse(JSON.stringify(game)));
    expect(game.floors.map(floor => floor.maze.layout?.version)).toEqual(['structured-v2', 'structured-v3']);
    const portal = useTownPortal(game);
    expect(portal.mode).toBe('town');
    expect(leaveTown(normalizeGameState(JSON.parse(JSON.stringify(portal)))).maze).toEqual(game.maze);
  });

  it('rejects unsupported/incomplete versioned saves rather than regenerating them', () => {
    const game = createNewGameState();
    for (const mutate of [
      (saved: any) => { saved.maze.layout.version = 'structured-v999'; },
      (saved: any) => { delete saved.maze.layout.assembly; },
      (saved: any) => { saved.maze.layout.assembly.recipe.version = 'spaces-v2'; },
      (saved: any) => { saved.maze.cells = []; },
      (saved: any) => { saved.maze.layout.rooms.pop(); },
    ]) {
      const saved = JSON.parse(JSON.stringify(game));
      mutate(saved);
      expect(() => normalizeGameState(saved)).toThrow();
    }
  });

  it('fails at projection capacity before returning a partial floor', () => {
    const recipe = createModuleRecipe('rpg-test', 1, 42);
    expect(() => generateModuleMaze(recipe, { maxModules: 256, maxProjectionCells: 1 })).toThrow(/projection budget/);
    const game = createNewGameState({ dungeonLevel: 125, maze: generateStructuredMaze(9, 13, () => 0.42) });
    const route = findPath(game.maze, game.maze.end)!.directions;
    let atExit = game;
    for (const direction of route.slice(0, -1)) atExit = moveActive(atExit, direction);
    const before = JSON.stringify(atExit);
    expect(() => moveActive(atExit, route[route.length - 1])).toThrow(/258.*256/);
    expect(JSON.stringify(atExit)).toBe(before);
  });

  it('rejects an assembled 256-room envelope beyond the independent cell budget', () => {
    const recipe = createModuleRecipe('large-room-test', 125, 0);
    recipe.policy = { ...recipe.policy, minSide: 15, maxSide: 15, attempts: 1 };
    expect(() => generateModuleMaze(recipe)).toThrow(/133176.*65536/);
  });
});

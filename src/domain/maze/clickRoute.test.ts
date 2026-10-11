import { describe, expect, it, vi } from 'vitest';
import { lineMaze, chestAt } from '../automation/autopilotTestFixtures';
import { advanceAutopilot } from '../automation/autopilot';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { openChest } from '../items/chests';
import { moveManually } from '../../hooks/useGameLoop';
import { findClickRoute } from './clickRoute';

describe('visible click routing', () => {
  it('reuses solver paths within sight, refuses unknown and unseen remembered destinations', () => {
    const maze = lineMaze(15);
    maze.visibility = { radius: 3, explored: [{ row: 0, column: 10 }] };
    expect(findClickRoute(maze, { row: 0, column: 3 })?.directions).toEqual(['east', 'east', 'east']);
    for (const column of [4, 10, -1, 0.5, 100]) expect(findClickRoute(maze, { row: 0, column })).toBeUndefined();
  });
  it('does not read remembered unseen links or use them as a shortcut', () => {
    const maze = lineMaze(15);
    maze.visibility = { radius: 2, explored: maze.cells.map(({ row, column }) => ({ row, column })) };
    const links = vi.fn(() => { throw new Error('Unseen topology read'); });
    for (const cell of maze.cells.slice(3)) Object.defineProperty(cell, 'links', { get: links });
    expect(findClickRoute(maze, { row: 0, column: 2 })?.distance).toBe(2);
    expect(findClickRoute(maze, { row: 0, column: 6 })).toBeUndefined();
    expect(links).not.toHaveBeenCalled();
  });
  it('rejects an obstructed or nonreciprocal edge', () => {
    const maze = lineMaze(4);
    maze.cells[1].links = ['east'];
    expect(findClickRoute(maze, { row: 0, column: 1 })).toBeUndefined();
  });
});

describe('voluntary ordinary chest command', () => {
  const fixture = () => createNewGameState({ randomBattles: false, maze: lineMaze(6), chests: [chestAt(2)] });
  it('manual steps never loot; an exact current chest opens once across normalization/reload', () => {
    const initial = fixture();
    const arrived = moveManually(moveManually(initial, 'east'), 'east');
    expect(arrived.chests).toEqual(initial.chests);
    expect(arrived.inventory).toEqual(initial.inventory);
    const rng = vi.fn(() => 0.9);
    expect(openChest(arrived, 'wrong', rng)).toBe(arrived);
    expect(openChest(initial, 'chest-2', rng)).toBe(initial);
    expect(rng).not.toHaveBeenCalled();
    const opened = openChest(arrived, 'chest-2', rng);
    expect(opened.chests[0].opened).toBe(true);
    expect(opened.chests[0].loot!.length).toBeGreaterThan(0);
    const loaded = normalizeGameState(JSON.parse(JSON.stringify(opened)));
    rng.mockClear();
    expect(openChest(loaded, 'chest-2', rng)).toBe(loaded);
    expect(rng).not.toHaveBeenCalled();
    expect(loaded.inventory).toEqual(opened.inventory);
  });
  it('rejects wrong floor, town, battle and defeated party', () => {
    const game = moveManually(moveManually(fixture(), 'east'), 'east');
    const invalid = [
      { ...game, dungeonLevel: 2 }, { ...game, mode: 'town' as const },
      { ...game, battle: { id: 'battle', wave: 1, round: 1, status: 'active' as const, enemies: [], log: [] } },
      { ...game, party: game.party.map(actor => ({ ...actor, hp: 0 })) },
    ];
    for (const state of invalid) expect(openChest(state, 'chest-2', () => { throw new Error('Invalid loot'); })).toBe(state);
  });
  it('Auto still deliberately collects through the same ordinary effect', () => {
    let game = { ...fixture(), mode: 'auto-play' as const };
    game = advanceAutopilot(game, () => 0.9) as typeof game;
    game = advanceAutopilot(game, () => 0.9) as typeof game;
    expect(game.chests[0].opened).toBe(true);
    expect(game.chests[0].loot!.length).toBeGreaterThan(0);
  });
});

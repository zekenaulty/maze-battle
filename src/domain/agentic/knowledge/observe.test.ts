import { describe, expect, it, vi } from 'vitest';
import { chestAt, roomAt } from '../../automation/autopilotTestFixtures';
import { computeVisibleCells } from '../../maze/visibility';
import { generateModuleMaze } from '../../maze/moduleGenerate';
import { createModuleRecipe } from '../../expedition/topology/modules/policy';
import { observeRpg, knownRpgRoute, rpgLocalContext, rpgRoomContext } from './index';
import { address, fixture, identity, observed, projected, routeBudget, time } from './fixtures.test-support';

describe('earned RPG observations', () => {
  it('matches linked BFS and explicitly allowlists evidence, without loot or room metadata', () => {
    const game = fixture();
    game.chests[0].loot = [{ id: 'secret-loot' } as never];
    const receipt = observed(game);
    expect(receipt.cells.map(({ address: { row, column } }) => ({ row, column }))).toEqual(computeVisibleCells(game.maze, game.maze.active, 2));
    expect(receipt.actor).toEqual(address(0));
    expect(receipt.cells[1]).toEqual({ address: address(1), links: ['east', 'west'], blocked: ['north', 'south'],
      roomIds: ['visible'], chests: [{ id: 'chest-1', position: address(1), opened: false }], stairs: [] });
    expect(receipt.cells[2].links).toEqual(['west']);
    expect(receipt.cells[2].blocked).not.toContain('east');
    expect(receipt.cells[0].stairs).toEqual(['town']);
    for (const forbidden of ['loot', 'secret-loot', 'treasure', 'boss', 'center', 'bounds', 'rows', 'columns', 'visited', 'explored']) {
      expect(JSON.stringify(receipt)).not.toContain(`"${forbidden}"`);
    }
  });

  it('defaults to radius seven and does not infer links from explored or visited', () => {
    const game = fixture();
    delete game.maze.visibility;
    game.maze.visited = game.maze.cells.map(({ row, column }) => ({ row, column }));
    const receipt = observed(game);
    expect(receipt.policy.radius).toBe(7);
    expect(receipt.cells).toHaveLength(8);
    const knowledge = projected(receipt);
    expect(knownRpgRoute(knowledge, address(0), address(12), routeBudget)).toEqual({ status: 'unknown', reason: 'target_unknown' });
  });

  it.each([1, 10])('observes the actual structured-v3 floor %s checkpoint without dense topology enumeration', floor => {
    const game = fixture();
    game.dungeonLevel = floor;
    game.maze = generateModuleMaze(createModuleRecipe('knowledge-proof', floor, 42));
    const expected = computeVisibleCells(game.maze).sort((a, b) => a.row - b.row || a.column - b.column);
    game.maze.cells.find = () => { throw new Error('Dense floor scan'); };
    const receipt = observed(game);
    expect(receipt.cells.map(cell => ({ row: cell.address.row, column: cell.address.column }))).toEqual(expected);
    expect(receipt.actor).toEqual({ floor, ...game.maze.active });
    expect(receipt.cells.length).toBeLessThanOrEqual(113);
  });

  it('preserves observed semantics for sparse and reordered legacy cell arrays', () => {
    const game = fixture();
    const dense = observed(game);
    game.maze.cells.reverse();
    expect(observed(game)).toEqual(dense);
    game.maze.cells = game.maze.cells.filter(cell => cell.column < 3);
    expect(observed(game)).toEqual(dense);
  });

  it('bounds a maximally open radius-16 observation at 545 visible cells', () => {
    const game = fixture(33, 16);
    game.maze.rows = 33;
    game.maze.active = { row: 16, column: 16 };
    game.maze.cells = Array.from({ length: 33 * 33 }, (_, index) => ({ row: Math.floor(index / 33), column: index % 33,
      links: ['north', 'east', 'south', 'west'] }));
    expect(observed(game).cells).toHaveLength(545);
  });

  it('has byte-equivalent observations, routes, context and refusals under hidden-world changes', () => {
    const a = fixture();
    const b = fixture(1000);
    b.maze.cells[3].links = [];
    b.maze.cells[600].links = ['north', 'south'];
    b.chests = [chestAt(1), chestAt(50), chestAt(75)];
    b.chests[1].opened = true;
    b.chests[2].loot = [{ id: 'hidden-loot' } as never];
    b.maze.layout!.rooms.push({ ...roomAt('unseen-room', 'safe', 900), tags: ['rare'] });
    b.maze.layout!.rooms[1] = { ...b.maze.layout!.rooms[1], kind: 'boss', name: 'hidden role', center: { row: 99, column: 99 }, tags: [] };
    b.maze.layout!.connections = [{ id: 'oracle-graph', fromRoomId: 'visible', toRoomId: 'unseen-room' } as never];
    const receipts = [observed(a), observed(b)];
    expect(JSON.stringify(receipts[0])).toBe(JSON.stringify(receipts[1]));
    const results = receipts.map(receipt => {
      const knowledge = projected(receipt);
      return [knowledge, knownRpgRoute(knowledge, address(0), address(2), routeBudget),
        knownRpgRoute(knowledge, address(0), address(10), routeBudget),
        rpgLocalContext(knowledge, address(0), { radius: 2, maxCells: 3, asOf: time(2) }),
        rpgRoomContext(knowledge, { floor: 1, roomId: 'visible' }, { offset: 0, limit: 2, asOf: time(2) })];
    });
    expect(JSON.stringify(results[0])).toBe(JSON.stringify(results[1]));
  });

  it('never reads unseen links, chest contents, role metadata, saved floors or historical exploration', () => {
    const game = fixture();
    const forbidden = vi.fn(() => { throw new Error('Forbidden read'); });
    for (const cell of game.maze.cells.slice(3)) Object.defineProperty(cell, 'links', { get: forbidden });
    for (const chest of game.chests) Object.defineProperty(chest, 'loot', { get: forbidden });
    for (const room of game.maze.layout!.rooms) {
      for (const key of ['kind', 'name', 'tags', 'center']) Object.defineProperty(room, key, { get: forbidden });
    }
    for (const key of ['connections', 'mainPath', 'zones']) Object.defineProperty(game.maze.layout, key, { get: forbidden });
    Object.defineProperty(game.maze.visibility, 'explored', { get: forbidden });
    Object.defineProperty(game.maze, 'visited', { get: forbidden });
    Object.defineProperty(game, 'floors', { get: forbidden });
    Object.defineProperty(game.chests[1], 'opened', { get: forbidden });
    Object.defineProperty(game.maze.layout!.rooms[2], 'id', { get: forbidden });
    expect(observed(game).cells).toHaveLength(3);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('copies and deeply freezes the receipt without freezing or mutating checkpoint/identity', () => {
    const game = fixture();
    const input = identity();
    const snapshot = JSON.stringify(game);
    const receipt = observeRpg(game, input);
    expect(JSON.stringify(game)).toBe(snapshot);
    expect(Object.isFrozen(game.maze.active)).toBe(false);
    expect(Object.isFrozen(input.revision)).toBe(false);
    if (receipt.status !== 'observed') throw new Error('Missing receipt');
    expect(Object.isFrozen(receipt.cells[1].chests[0].position)).toBe(true);
    expect(Object.isFrozen(receipt.revision)).toBe(true);
    game.maze.active.column = 5;
    game.chests[0].opened = true;
    input.revision.revision = 99;
    expect(receipt.actor.column).toBe(0);
    expect(receipt.cells[1].chests[0].opened).toBe(false);
    expect(receipt.revision.revision).toBe(1);
  });

  it('uses explicit floor-scoped stairs and filters other-floor chests', () => {
    const game = fixture(3);
    game.dungeonLevel = 2;
    const receipt = observed(game);
    expect(receipt.actor.floor).toBe(2);
    expect(receipt.cells[0].stairs).toEqual(['up']);
    expect(receipt.cells[2].stairs).toEqual(['down']);
    expect(receipt.cells.flatMap(cell => cell.chests)).toEqual([]);
  });

  it.each([-1, 0.5, NaN, Infinity, 17])('refuses unsupported radius %s before traversal', radius => {
    const game = fixture();
    game.maze.visibility!.radius = radius;
    expect(observeRpg(game, identity())).toEqual({ status: 'refused', reason: 'observation_limit' });
  });

  it('refuses invalid identity, town checkpoint and excessive visible cell features', () => {
    const game = fixture();
    expect(observeRpg(game, { ...identity(), id: '' })).toEqual({ status: 'refused', reason: 'invalid_identity' });
    expect(observeRpg(game, { ...identity(), observedAt: 'invalid' })).toEqual({ status: 'refused', reason: 'invalid_identity' });
    expect(observeRpg({ ...game, mode: 'town' }, identity())).toEqual({ status: 'refused', reason: 'invalid_checkpoint' });
    game.chests = Array.from({ length: 9 }, (_, i) => ({ ...chestAt(1), id: `chest-${i}` }));
    expect(observeRpg(game, identity())).toEqual({ status: 'refused', reason: 'observation_limit' });
  });
});

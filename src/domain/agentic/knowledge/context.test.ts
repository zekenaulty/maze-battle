import { describe, expect, it } from 'vitest';
import { roomAt } from '../../automation/autopilotTestFixtures';
import { rpgLocalContext, rpgRoomContext } from './index';
import { address, fixture, observed, projected, time } from './fixtures.test-support';

describe('bounded remembered RPG context', () => {
  it('reports cell and edge ages independently without refreshing sources during recall', () => {
    const game = fixture(20, 4);
    const first = projected(observed(game));
    game.maze.active.column = 4;
    game.maze.visibility!.radius = 1;
    const state = projected(observed(game, 2), first);
    const snapshot = JSON.stringify(state);
    const context = rpgLocalContext(state, address(3), { radius: 1, maxCells: 3, asOf: time(5) });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') throw new Error('Missing context');
    const cell = context.cells.find(cell => cell.address.column === 3)!;
    expect(cell.ageMs).toBe(3000);
    expect(cell.edges.find(edge => edge.direction === 'west')).toMatchObject({ ageMs: 4000, source: { id: 'observation-1' } });
    expect(cell.edges.find(edge => edge.direction === 'east')).toMatchObject({ ageMs: 3000, source: { id: 'observation-2' } });
    expect(context.cells.find(cell => cell.address.column === 2)!.ageMs).toBe(4000);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(Object.isFrozen(context.cells[0].edges)).toBe(true);
  });

  it('returns only selected-room internals and page-local connection IDs/sources', () => {
    const game = fixture(8, 5);
    game.maze.layout!.rooms = [{ ...roomAt('selected', 'ordinary', 0), columns: 2 },
      { ...roomAt('neighbor', 'boss', 2), columns: 3 }, roomAt('unseen', 'safe', 7)];
    const knowledge = projected(observed(game));
    const result = rpgRoomContext(knowledge, { floor: 1, roomId: 'selected' }, { offset: 0, limit: 64, asOf: time(2) });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Missing room');
    expect(result.cells.map(cell => cell.address)).toEqual([address(0), address(1)]);
    expect(result.rememberedCellCount).toBe(2);
    expect(result.connections.map(connection => connection.roomId)).toEqual(['neighbor']);
    expect(result.connections[0].sources[0].id).toBe('observation-1');
    expect(result.cells[1].edges.some(edge => edge.direction === 'east')).toBe(false);
    expect(result.edgeScope).toBe('returned_cells');
    expect(result.nextOffset).toBeUndefined();
    for (const hidden of ['boss', 'unseen', 'center', 'bounds', 'tags', 'loot']) expect(JSON.stringify(result)).not.toContain(`"${hidden}"`);
  });

  it('pages earned room membership without claiming the full actual room size', () => {
    const game = fixture(20, 4);
    game.maze.layout!.rooms = [{ ...roomAt('large', 'ordinary', 0), columns: 20 }];
    const knowledge = projected(observed(game));
    const query = (offset: number) => rpgRoomContext(knowledge, { floor: 1, roomId: 'large' }, { offset, limit: 2, asOf: time(2) });
    const first = query(0);
    const second = query(2);
    const last = query(4);
    expect(first).toMatchObject({ status: 'ready', rememberedCellCount: 5, nextOffset: 2 });
    expect(second).toMatchObject({ status: 'ready', nextOffset: 4 });
    expect(last.status).toBe('ready');
    if (last.status === 'ready') {
      expect(last.cells.map(cell => cell.address.column)).toEqual([4]);
      expect(last.nextOffset).toBeUndefined();
    }
    expect(query(10)).toMatchObject({ status: 'ready', cells: [] });
  });

  it('refuses invalid budgets and clocks and distinguishes unknown from empty', () => {
    const knowledge = projected();
    const room = { floor: 1, roomId: 'visible' };
    for (const limit of [0, 65, Infinity, 1.5]) {
      expect(rpgRoomContext(knowledge, room, { offset: 0, limit, asOf: time(2) })).toEqual({ status: 'refused', reason: 'invalid_budget' });
    }
    for (const offset of [-1, 2049, Infinity, 1.5]) {
      expect(rpgRoomContext(knowledge, room, { offset, limit: 2, asOf: time(2) })).toEqual({ status: 'refused', reason: 'invalid_budget' });
    }
    for (const asOf of [time(0), 'invalid']) {
      expect(rpgRoomContext(knowledge, room, { offset: 0, limit: 2, asOf })).toEqual({ status: 'refused', reason: 'invalid_as_of' });
      expect(rpgLocalContext(knowledge, address(0), { radius: 0, maxCells: 1, asOf })).toEqual({ status: 'refused', reason: 'invalid_as_of' });
    }
    expect(rpgRoomContext(knowledge, { floor: 2, roomId: 'visible' }, { offset: 0, limit: 2, asOf: time(2) }))
      .toEqual({ status: 'unknown', reason: 'room_unknown' });
    expect(rpgLocalContext(knowledge, address(10), { radius: 0, maxCells: 1, asOf: time(2) }))
      .toEqual({ status: 'unknown', reason: 'origin_unknown' });
    expect(rpgLocalContext(knowledge, address(0), { radius: 8, maxCells: 3, asOf: time(2) }))
      .toEqual({ status: 'refused', reason: 'invalid_budget' });
    const unassociated = fixture();
    unassociated.maze.layout!.rooms = [];
    expect(rpgLocalContext(projected(observed(unassociated)), address(0), { radius: 2, maxCells: 2, asOf: time(2) }))
      .toEqual({ status: 'refused', reason: 'visit_limit' });
  });

  it('restricts local detail to the selected observed room, including overlapping legacy associations', () => {
    const game = fixture(6, 5);
    game.maze.layout!.rooms = [{ ...roomAt('a', 'ordinary', 0), columns: 2 },
      { ...roomAt('b', 'boss', 1), columns: 4 }];
    const knowledge = projected(observed(game));
    const context = rpgLocalContext(knowledge, address(1), { roomId: 'a', radius: 5, maxCells: 64, asOf: time(2) });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') throw new Error('Missing context');
    expect(context.roomId).toBe('a');
    expect(context.cells.map(cell => cell.address.column)).toEqual([1, 0]);
    expect(context.cells[0].edges.some(edge => edge.direction === 'east')).toBe(false);
    expect(rpgLocalContext(knowledge, address(1), { radius: 5, maxCells: 64, asOf: time(2) })).toEqual(context);
    expect(rpgLocalContext(knowledge, address(0), { roomId: 'b', radius: 5, maxCells: 64, asOf: time(2) }))
      .toEqual({ status: 'unknown', reason: 'room_unknown' });
  });

  it('point-reads only a room page and its immediate observed connections, not other-room internals', () => {
    const game = fixture(8, 7);
    game.maze.layout!.rooms = [roomAt('selected', 'ordinary', 0), { ...roomAt('neighbor', 'boss', 1), columns: 7 }];
    const first = projected(observed(game));
    const cells = new Proxy(first.floors[1].cells, {
      ownKeys() { throw new Error('Full-floor enumeration'); },
      get(target, key) {
        if (!['0:0', '0:1'].includes(String(key))) throw new Error('Distant cell read');
        return Reflect.get(target, key);
      },
    });
    const knowledge = { ...first, floors: { 1: { ...first.floors[1], cells } } };
    expect(rpgRoomContext(knowledge, { floor: 1, roomId: 'selected' }, { offset: 0, limit: 1, asOf: time(2) }).status).toBe('ready');
    expect(rpgLocalContext(knowledge, address(0), { radius: 0, maxCells: 1, asOf: time(2) })).toMatchObject({ status: 'ready', cells: [{ address: address(0) }] });
  });

  it('bounds connection summaries even when individual observations fit their limits', () => {
    const game = fixture(14, 13);
    game.maze.layout!.rooms = [{ ...roomAt('selected', 'ordinary', 0), columns: 14 },
      ...Array.from({ length: 14 }, (_, column) => roomAt(`overlap-${column}`, 'ordinary', column))];
    const knowledge = projected(observed(game));
    expect(rpgRoomContext(knowledge, { floor: 1, roomId: 'selected' }, { offset: 0, limit: 64, asOf: time(2) }))
      .toEqual({ status: 'refused', reason: 'context_limit' });
  });
});

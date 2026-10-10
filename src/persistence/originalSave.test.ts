import { describe, expect, it } from 'vitest';
import { fromLegacyState, normalizeGameState } from '../domain/gameFactory';
import fresh from '../../tests/fixtures/original-saves/fresh.json';
import advanced from '../../tests/fixtures/original-saves/advanced.json';

describe('original JavaScript save conversion', () => {
  for (const [name, fixture] of Object.entries({ fresh, advanced })) {
    it(`preserves the actual ${name} producer topology, progression and vitals`, () => {
      const original = JSON.stringify(fixture.state);
      const game = fromLegacyState(name, fixture.state);
      expect(game.dungeonLevel).toBe(fixture.state.level);
      expect(game.mazeMaxRooms).toBe(fixture.state.mazeMaxRooms);
      expect(game.randomBattles).toBe(fixture.state.randomBattles);
      expect(game.maze).toMatchObject({
        rows: fixture.state.maze.rows, columns: fixture.state.maze.columns,
        start: fixture.state.maze.start, end: fixture.state.maze.end,
        active: fixture.state.maze.active, visited: fixture.state.maze.visited,
      });
      const offsets = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] };
      expect(game.maze.cells.map((cell) => ({
        row: cell.row, column: cell.column,
        neighbors: cell.links.map((link) => ({ row: cell.row + offsets[link][0], column: cell.column + offsets[link][1] })),
      }))).toEqual(fixture.state.maze.cells.map((cell) => ({ row: cell.row, column: cell.column, neighbors: cell.links.items })));
      fixture.expected.forEach((actor, i) => expect(game.party[i]).toMatchObject(actor));
      expect(game.inventory.gold).toBe(Math.max(...fixture.expected.map((actor) => actor.gold)));
      expect(game.inventory.items).toEqual([]);
      expect(normalizeGameState(game)).toEqual(game);
      expect(JSON.stringify(fixture.state)).toBe(original);
    });
  }

  it('preserves the original level-25 warrior charge upgrade', () => {
    const game = fromLegacyState('advanced', advanced.state);
    expect(game.party[0].skills.find((skill) => skill.id === 'cleave')).toMatchObject({ charges: 3, maxCharges: 3 });
    expect(game.party[0].skills.find((skill) => skill.id === 'slam')).toMatchObject({ charges: 2, maxCharges: 2 });
    expect(game.inventory.gold).toBe(137);
    expect(game.party.map((actor) => actor.gold)).toEqual([137, 91, 137]);
  });

  const cases: [string, (state: typeof fresh.state) => void, string][] = [
    ['oversized grid', (s) => { s.maze.rows = 1000000; }, 'maze.rows'],
    ['oversized cell product', (s) => { s.maze.rows = s.maze.columns = 1024; }, '16384 cells'],
    ['fractional grid', (s) => { s.maze.rows = 3.1; }, 'integer'],
    ['missing grid', (s) => { s.maze.cells = []; }, 'incomplete grid'],
    ['duplicate cell', (s) => { s.maze.cells[1] = s.maze.cells[0]; }, 'duplicate cell'],
    ['wrong owner', (s) => { s.maze.cells[0].links.row = 1; }, 'wrong owner'],
    ['duplicate link', (s) => { s.maze.cells[0].links.items.push(s.maze.cells[0].links.items[0]); }, 'duplicate neighbor'],
    ['out-of-bounds link', (s) => { s.maze.cells[0].links.items[0].row = -1; }, 'links.items.row'],
    ['nonadjacent link', (s) => { s.maze.cells[0].links.items[0] = { row: 5, column: 5 }; }, 'non-adjacent'],
    ['one-way link', (s) => { s.maze.cells[0].links.items = []; }, 'non-reciprocal'],
    ['disconnected cells', (s) => { s.maze.cells.forEach((cell) => { cell.links.items = []; }); }, 'disconnected'],
    ['invalid stairs', (s) => { s.maze.end.column = 100; }, 'maze.end.column'],
    ['invalid visited', (s) => { s.maze.visited.push({ row: -1, column: 0 }); }, 'maze.visited'],
    ['excess HP', (s) => { s.warrior.hp = 1e9; }, 'warrior.hp'],
    ['invalid actor level', (s) => { s.mage.level = Infinity; }, 'mage.level'],
    ['negative gold', (s) => { s.healer.gold = -1; }, 'healer.gold'],
    ['nonfinite base', (s) => { s.mage.baseHp = NaN; }, 'mage.baseHp'],
  ];
  it.each(cases)('rejects %s without generating a replacement maze', (_name, corrupt, message) => {
    const state = structuredClone(fresh.state);
    corrupt(state);
    expect(() => fromLegacyState('broken-slot', state)).toThrow(message);
    expect(() => fromLegacyState('broken-slot', state)).toThrow('broken-slot');
  });

  it('does not accept disposable development schemas or partial actor proxies', () => {
    expect(() => fromLegacyState('partial', { level: 7, warrior: { level: 3 } })).toThrow();
    const state = structuredClone(fresh.state);
    (state.maze.cells[0] as unknown as { links: string[] }).links = ['south'];
    expect(() => fromLegacyState('modern-shaped', state)).toThrow('links: expected an object');
  });
});

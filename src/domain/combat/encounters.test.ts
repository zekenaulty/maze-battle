import { describe, expect, it, vi } from 'vitest';
import { lineMaze, roomAt } from '../automation/autopilotTestFixtures';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import type { GridPosition, MazeRoomState } from '../types';
import { shouldStartEncounter } from './encounters';

function fixture(rooms: MazeRoomState[], position: GridPosition = { row: 0, column: 2 }) {
  const game = createNewGameState({ maze: lineMaze(9, rooms), randomBattles: true });
  return { ...game, maze: { ...game.maze, active: position } };
}

describe('wandering encounter policy', () => {
  it.each(['start', 'hub', 'safe'] as const)('recognizes %s kind even without a safe tag', (kind) => {
    const game = fixture([{ ...roomAt('room', kind, 2), tags: [] }]);
    const rng = vi.fn(() => 0);
    expect(shouldStartEncounter(game, rng)).toBe(false);
    expect(rng).not.toHaveBeenCalled();
    expect(game.randomBattles).toBe(true);
  });

  it('recognizes an explicit safe tag independently of room kind', () => {
    const game = fixture([{ ...roomAt('room', 'treasure', 2), tags: ['safe'] }]);
    expect(shouldStartEncounter(game, () => 0)).toBe(false);
  });

  it('uses room bounds, not names, zones, fog, visited cells or another floor', () => {
    const game = fixture([{ ...roomAt('safe', 'treasure', 2), name: 'Sanctuary', tags: [] }, roomAt('elsewhere', 'safe', 5)]);
    game.maze.visited = [{ row: 0, column: 5 }];
    game.maze.visibility = { radius: 0, explored: [] };
    game.maze.layout!.zones = [{ id: 'safe', name: 'Safe', tint: 'green', rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 9 }];
    game.floors.push({ level: 2, mazeMaxRooms: 32, monsterTags: game.monsterTags, maze: lineMaze(9, [roomAt('other-floor', 'safe', 2)]) });
    expect(shouldStartEncounter(game, () => 0)).toBe(true);
  });

  it.each([
    [1, 2, false], [2, 3, false],
    [0, 2, true], [3, 2, true], [1, 1, true], [1, 4, true],
  ])('uses half-open rectangular membership at row %i column %i', (row, column, eligible) => {
    const room = { ...roomAt('safe', 'safe', 2), row: 1, rows: 2, columns: 2 };
    expect(shouldStartEncounter(fixture([room], { row, column }), () => 0)).toBe(eligible);
  });

  it.each([false, true])('retains boss attribution priority in legacy overlaps (reversed=%s)', (reverse) => {
    const rooms: MazeRoomState[] = [roomAt('safe', 'safe', 2), { ...roomAt('boss', 'boss', 2), tags: ['hostile'] }];
    const game = fixture(reverse ? rooms.reverse() : rooms);
    expect(shouldStartEncounter(game, () => 0)).toBe(true);
  });

  it('retains saved room order for overlapping non-boss rooms', () => {
    const safe = roomAt('safe', 'safe', 2);
    const ordinary = roomAt('ordinary', 'treasure', 2);
    expect(shouldStartEncounter(fixture([safe, ordinary]), () => 0)).toBe(false);
    expect(shouldStartEncounter(fixture([ordinary, safe]), () => 0)).toBe(true);
  });

  it.each(['start', 'hub', 'safe'] as const)('keeps legacy missing-tag normalization for %s rooms', (kind) => {
    const stored = JSON.parse(JSON.stringify(fixture([roomAt('room', kind, 2)])));
    delete stored.maze.layout.rooms[0].tags;
    const loaded = normalizeGameState(stored);
    expect(loaded.maze.layout?.rooms[0].tags).toContain('safe');
    expect(shouldStartEncounter(loaded, () => 0)).toBe(false);
  });

  it.each([[0, true], [0.349, true], [0.35, false], [0.999, false]] as const)('preserves the 35 percent roll outside safe rooms (%s)', (roll, expected) => {
    const game = fixture([]);
    const rng = vi.fn(() => roll);
    expect(shouldStartEncounter(game, rng)).toBe(expected);
    expect(rng).toHaveBeenCalledOnce();
  });

  it('does not consume encounter RNG when globally disabled', () => {
    const rng = vi.fn(() => 0);
    expect(shouldStartEncounter({ ...fixture([]), randomBattles: false }, rng)).toBe(false);
    expect(rng).not.toHaveBeenCalled();
  });
});

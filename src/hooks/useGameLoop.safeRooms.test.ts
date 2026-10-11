import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceAutomaticPlay, toggleWaves } from '../domain/automation/autoPlay';
import { advanceAutopilot } from '../domain/automation/autopilot';
import { chestAt, lineMaze, questFor, roomAt } from '../domain/automation/autopilotTestFixtures';
import { startBattle } from '../domain/combat/battleEngine';
import { createNewGameState, normalizeGameState } from '../domain/gameFactory';
import type { GameState, MazeLayoutVersion, MazeRoomState } from '../domain/types';
import { moveManually } from './useGameLoop';

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0));
afterEach(() => vi.restoreAllMocks());

function safeRoom(column: number, columns = 1): MazeRoomState {
  return { ...roomAt(`safe-${column}`, 'safe', column), columns, tags: ['safe'] };
}

function fixture(mode: 'manual' | 'auto-play', rooms: MazeRoomState[], active = 1, version: MazeLayoutVersion = 'structured-v1') {
  const maze = lineMaze(9, rooms, active);
  if (maze.layout) maze.layout.version = version;
  return createNewGameState({ mode, maze, randomBattles: true, chests: [chestAt(0, true)] });
}

const controllers = [
  { mode: 'manual' as const, step: (game: GameState) => moveManually(game, 'east') },
  { mode: 'auto-play' as const, step: (game: GameState) => advanceAutomaticPlay(game, () => 0) },
];

describe.each(controllers)('$mode safe-room wandering encounters', ({ mode, step }) => {
  it('protects a direct join between safe rooms without protecting the next outside cell', () => {
    const joined = fixture(mode, [safeRoom(2, 2), { ...safeRoom(4, 2), kind: 'hub' }], 3, 'structured-v2');
    const inside = step(step(joined));
    expect(inside.maze.active.column).toBe(5);
    expect(inside.battle).toBeUndefined();
    expect(step(inside).battle?.origin?.position.column).toBe(6);
  });

  it('keeps boss priority and battle attribution when a destination overlaps a safe room', () => {
    const rooms: MazeRoomState[] = [safeRoom(2, 3), { ...roomAt('boss', 'boss', 2), tags: ['hostile'] }];
    const entered = step(fixture(mode, rooms));
    expect(entered.battle?.origin?.roomId).toBe('boss');
    expect(entered.maze.active.column).toBe(2);
  });

  it.each(['structured-v1', 'structured-v2'] as const)('protects doorway entry and interior but not the connecting corridor (%s)', (version) => {
    let game = fixture(mode, [safeRoom(2, 3), { ...safeRoom(6), kind: 'hub' }], 1, version);
    for (const column of [2, 3, 4]) {
      game = step(game);
      expect(game.maze.active.column).toBe(column);
      expect(game.battle).toBeUndefined();
      expect(game.randomBattles).toBe(true);
    }
    const exited = step(game);
    expect(exited.maze.active.column).toBe(5);
    expect(exited.battle?.status).toBe('active');
    expect(exited.battle?.origin).toEqual({ floor: 1, position: { row: 0, column: 5 } });
  });

  it.each(['structured-v1', 'structured-v2'] as const)('recomputes membership after save/normalize reload (%s)', (version) => {
    const entered = step(fixture(mode, [safeRoom(2, 3)], 1, version));
    const reloaded = normalizeGameState(JSON.parse(JSON.stringify(entered)));
    expect(reloaded.maze.layout).toEqual(entered.maze.layout);
    expect(reloaded.maze.active.column).toBe(2);
    expect(reloaded.randomBattles).toBe(true);
    const inside = step(step(reloaded));
    expect(inside.maze.active.column).toBe(4);
    expect(inside.battle).toBeUndefined();
    expect(step(inside).battle?.status).toBe('active');
  });

  it('uses the destination floor on the first movement after descent', () => {
    const base = fixture(mode, [safeRoom(6, 3)], 7);
    const game: GameState = {
      ...base,
      floors: [...base.floors, { level: 2, mazeMaxRooms: 42, monsterTags: base.monsterTags, maze: lineMaze(9, [safeRoom(0, 3)]) }],
      chests: [...base.chests, { ...chestAt(0, true), id: 'floor-2-chest', level: 2 }],
    };
    let descended = step(game);
    if (mode === 'auto-play') descended = step(descended);
    expect(descended.dungeonLevel).toBe(2);
    expect(descended.maze.active.column).toBe(0);
    expect(descended.battle).toBeUndefined();
    for (const column of [1, 2]) {
      descended = step(descended);
      expect(descended.maze.active.column).toBe(column);
      expect(descended.battle).toBeUndefined();
    }
    const outside = step(descended);
    expect(outside.battle?.origin).toEqual({ floor: 2, position: { row: 0, column: 3 } });
  });

  it('retains ordinary encounters on layout-free legacy floors', () => {
    const game = normalizeGameState(JSON.parse(JSON.stringify(fixture(mode, []))));
    expect(game.maze.layout).toBeUndefined();
    expect(step(game).battle?.status).toBe('active');
  });

  it('does not carry safety from the previous floor into an unsafe destination floor', () => {
    const base = fixture(mode, [safeRoom(0, 9)], 7);
    const game: GameState = {
      ...base,
      floors: [...base.floors, { level: 2, mazeMaxRooms: 42, monsterTags: base.monsterTags, maze: lineMaze(9) }],
      chests: [...base.chests, { ...chestAt(0, true), id: 'floor-2-chest', level: 2 }],
    };
    let descended = step(game);
    if (mode === 'auto-play') descended = step(descended);
    expect(descended.dungeonLevel).toBe(2);
    expect(descended.battle).toBeUndefined();
    expect(step(descended).battle?.origin).toEqual({ floor: 2, position: { row: 0, column: 1 } });
  });

  it('does not roll or spawn when movement cannot progress', () => {
    const base = fixture(mode, []);
    const game = { ...base, maze: { ...base.maze, cells: base.maze.cells.map(cell => ({ ...cell, links: [] })) } };
    vi.mocked(Math.random).mockClear();
    const stopped = step(game);
    expect(stopped.maze.active).toEqual(game.maze.active);
    expect(stopped.battle).toBeUndefined();
    expect(Math.random).not.toHaveBeenCalled();
  });

  it('still respects global encounter disabling outside safe rooms', () => {
    expect(step({ ...fixture(mode, []), randomBattles: false }).battle).toBeUndefined();
  });
});

describe('safe-room policy boundaries', () => {
  it('rechecks every manual boundary crossing without cached immunity', () => {
    let game = fixture('manual', [safeRoom(2, 2)], 2);
    vi.mocked(Math.random).mockReturnValue(0.99);
    game = moveManually(game, 'west');
    expect(game.maze.active.column).toBe(1);
    expect(game.battle).toBeUndefined();
    vi.mocked(Math.random).mockReturnValue(0);
    game = moveManually(game, 'east');
    expect(game.maze.active.column).toBe(2);
    expect(game.battle).toBeUndefined();
    game = moveManually(game, 'west');
    expect(game.battle?.origin?.position.column).toBe(1);
  });

  it('preserves a loaded active battle in a safe room and blocks manual movement', () => {
    const battling = startBattle(fixture('manual', [safeRoom(1, 3)]), () => 0);
    const loaded = normalizeGameState(JSON.parse(JSON.stringify(battling)));
    expect(loaded.battle?.id).toBe(battling.battle?.id);
    expect(loaded.battle?.status).toBe('active');
    expect(moveManually(loaded, 'east')).toBe(loaded);
    expect(advanceAutopilot({ ...loaded, mode: 'auto-play' }).battle).toBe(loaded.battle);
  });

  it('does not intercept explicit battles, waves, or quest encounters', () => {
    const game = fixture('manual', [safeRoom(1, 3)]);
    expect(startBattle(game, () => 0).battle?.status).toBe('active');
    expect(toggleWaves(game, () => 0).battle?.returnMode).toBe('waves');
    expect(advanceAutomaticPlay({ ...game, mode: 'waves' }, () => 0).battle?.status).toBe('active');
    const questGame = { ...game, mode: 'auto-play' as const, quests: [questFor(game.maze.layout!.rooms[0], 'kill')] };
    expect(advanceAutomaticPlay(questGame, () => 0).battle?.origin?.roomId).toBe('safe-1');
  });
});

import { describe, expect, it } from 'vitest';
import { createNewGameState, fromLegacyState, moveActive, normalizeGameState, setActorAutoBattle, setAutoThrottle, setMazeTexture, setPartyAutoBattle, summarizeGame } from './gameFactory';
import { AUTO_THROTTLE_MAX_MS, AUTO_THROTTLE_MIN_MS, DEFAULT_AUTO_THROTTLE_MS } from './automation/throttle';
import { DEFAULT_MAZE_TEXTURE } from './maze/textureOptions';
import type { MazeState } from './types';

describe('gameFactory', () => {
  it('creates a versioned game state', () => {
    const game = createNewGameState();

    expect(game.schemaVersion).toBe(1);
    expect(game.dungeonLevel).toBe(1);
    expect(game.wave).toBe(0);
    expect(game.mazeTexture).toBe(DEFAULT_MAZE_TEXTURE);
    expect(game.autoThrottleMs).toBe(DEFAULT_AUTO_THROTTLE_MS);
    expect(game.facing).toBe('south');
    expect(game.floors).toHaveLength(1);
    expect(game.party.map((actor) => actor.displayName)).toEqual(['Vor', 'Zyth', 'Ayla']);
  });

  it('moves the active position inside maze bounds', () => {
    const game = createNewGameState({
      maze: {
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
      },
    });
    const blocked = moveActive(game, 'north');
    const moved = moveActive(game, 'east');

    expect(blocked.maze.active).toEqual(game.maze.active);
    expect(blocked.facing).toBe('north');
    expect(moved.dungeonLevel).toBe(2);
    expect(moved.facing).toBe('east');
    expect(moved.maze.active).toEqual(moved.maze.start);
  });

  it('saves floors and lets start stairs return to the previous floor', () => {
    const floorOne: MazeState = {
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
    const floorTwo: MazeState = {
      rows: 1,
      columns: 3,
      start: { row: 0, column: 0 },
      end: { row: 0, column: 2 },
      active: { row: 0, column: 0 },
      visited: [{ row: 0, column: 0 }],
      cells: [
        { row: 0, column: 0, links: ['east'] },
        { row: 0, column: 1, links: ['west', 'east'] },
        { row: 0, column: 2, links: ['west'] },
      ],
    };
    const game = createNewGameState({
      maze: floorOne,
      floors: [
        { level: 1, mazeMaxRooms: 32, maze: floorOne },
        { level: 2, mazeMaxRooms: 42, maze: floorTwo },
      ],
    });

    const floor2 = moveActive(game, 'east');
    const offStart = moveActive(floor2, 'east');
    const returned = moveActive(offStart, 'west');

    expect(floor2.dungeonLevel).toBe(2);
    expect(floor2.maze.active).toEqual(floorTwo.start);
    expect(offStart.floors.find((floor) => floor.level === 2)?.maze.visited).toContainEqual({ row: 0, column: 1 });
    expect(returned.dungeonLevel).toBe(1);
    expect(returned.maze.active).toEqual(floorOne.end);
    expect(returned.floors.map((floor) => floor.level)).toEqual([1, 2]);
  });

  it('uses floor one start stairs to return to town', () => {
    const floorOne: MazeState = {
      rows: 1,
      columns: 3,
      start: { row: 0, column: 0 },
      end: { row: 0, column: 2 },
      active: { row: 0, column: 1 },
      visited: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
      ],
      cells: [
        { row: 0, column: 0, links: ['east'] },
        { row: 0, column: 1, links: ['west', 'east'] },
        { row: 0, column: 2, links: ['west'] },
      ],
    };
    const game = createNewGameState({ mode: 'manual', dungeonLevel: 1, maze: floorOne });

    const returned = moveActive(game, 'west');

    expect(returned.mode).toBe('town');
    expect(returned.dungeonLevel).toBe(1);
    expect(returned.maze.active).toEqual(floorOne.start);
    expect(returned.floors.find((floor) => floor.level === 1)?.maze.active).toEqual(floorOne.start);
    expect(returned.activityLog[0]).toBe('Returned to town.');
  });

  it('summarizes party levels', () => {
    const game = createNewGameState();

    expect(summarizeGame(game)).toEqual({
      dungeonLevel: 1,
      partyLevels: {
        warrior: 1,
        mage: 1,
        healer: 1,
      },
    });
  });

  it('toggles one actor auto battle flag without changing the rest of the party', () => {
    const game = createNewGameState();
    const warrior = game.party[0];
    const next = setActorAutoBattle(game, warrior.id, false);

    expect(next.party[0].autoBattle).toBe(false);
    expect(next.party.slice(1).every((actor) => actor.autoBattle)).toBe(true);
    expect(next.activityLog[0]).toBe('Vor auto battle disabled.');
  });

  it('toggles party auto battle as one linked control', () => {
    const game = createNewGameState();
    const next = setPartyAutoBattle(game, false);

    expect(next.party.every((actor) => !actor.autoBattle)).toBe(true);
    expect(next.activityLog[0]).toBe('Party auto battle disabled.');
  });

  it('normalizes auto throttle settings', () => {
    const game = createNewGameState({ autoThrottleMs: 333 });
    const low = setAutoThrottle(game, -1);
    const high = setAutoThrottle(game, 99999);

    expect(game.autoThrottleMs).toBe(350);
    expect(low.autoThrottleMs).toBe(AUTO_THROTTLE_MIN_MS);
    expect(high.autoThrottleMs).toBe(AUTO_THROTTLE_MAX_MS);
  });

  it('persists a selected maze texture', () => {
    const game = createNewGameState();
    const next = setMazeTexture(game, 'brick-worn');

    expect(next.mazeTexture).toBe('brick-worn');
  });

  it('maps legacy saves into the new schema', () => {
    const game = fromLegacyState('auto', {
      level: 7,
      randomBattles: false,
      warrior: {
        level: 3,
        hp: 44,
        mp: 0,
        gold: 12,
        points: 2,
        strength: 55,
      },
    });

    expect(game.dungeonLevel).toBe(7);
    expect(game.randomBattles).toBe(false);
    expect(game.party.find((actor) => actor.role === 'warrior')).toMatchObject({
      level: 3,
      hp: 44,
      gold: 12,
      attributes: {
        available: 2,
        strength: 55,
      },
    });
    expect(game.source?.type).toBe('legacy-local-storage');
  });

  it('normalizes older indexeddb saves without combat fields', () => {
    const oldSave = createNewGameState();
    const [warrior] = oldSave.party;
    const normalized = normalizeGameState({
      ...oldSave,
      party: [
        {
          ...warrior,
          skills: undefined,
          combat: undefined,
        },
      ],
    });

    expect(normalized.party[0].skills.map((skill) => skill.id)).toEqual(['slash', 'cleave', 'slam']);
    expect(normalized.party[0].combat).toEqual({
      baseDamage: 8,
      scaleWith: 'strength',
    });
    expect(normalized.mazeTexture).toBe(DEFAULT_MAZE_TEXTURE);
    expect(normalized.maze.cells.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createNewGameState, descendFloor, fromLegacyState, moveActive, normalizeGameState, setActorAutoBattle, setAutoThrottle, setMazeTexture, setPartyAutoBattle, summarizeGame } from './gameFactory';
import { AUTO_THROTTLE_MAX_MS, AUTO_THROTTLE_MIN_MS, DEFAULT_AUTO_THROTTLE_MS } from './automation/throttle';
import { DEFAULT_MAZE_TEXTURE } from './maze/textureOptions';
import type { MazeState } from './types';
import { chestAt, lineMaze, questFor, roomAt } from './automation/autopilotTestFixtures';
import originalSave from '../../tests/fixtures/original-saves/advanced.json';

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
    const game = fromLegacyState('auto', originalSave.state);

    expect(game.dungeonLevel).toBe(7);
    expect(game.randomBattles).toBe(false);
    expect(game.party.find((actor) => actor.role === 'warrior')).toMatchObject(originalSave.expected[0]);
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

  it('round-trips optional policies, persistent routes, encounter history and explicit topology without regenerating floors', () => {
    const hub = roomAt('hub', 'hub', 0);
    const boss = roomAt('boss', 'boss', 3);
    const maze = lineMaze(5, [hub, boss]);
    maze.layout = {
      ...maze.layout!, version: 'structured-v2',
      connections: [{ id: 'edge', fromRoomId: hub.id, toRoomId: boss.id, kind: 'tree', fromDoor: hub.center, toDoor: boss.center, path: [hub.center, { row: 0, column: 1 }, { row: 0, column: 2 }, boss.center], width: 1 }],
    };
    const base = createNewGameState({
      maze, mode: 'auto-play',
      inventoryPolicy: { autoEquip: false, autoSellJunk: true, autoStash: false, autoRestock: true, healthReserve: 4, manaReserve: 3, portalReserve: 2 },
      townReturnMode: 'auto-play',
      autopilot: { phase: 'travel', floor: 1, targetId: 'quest:boss', targetPosition: boss.center, route: ['east', 'east', 'east'], lastPosition: maze.active, stalledTicks: 0, reason: 'Clear boss' },
      floors: [{ level: 2, maze, mazeMaxRooms: 42 }],
    });
    const quest = { ...questFor(boss, 'kill', 3), task: { ...questFor(boss, 'kill', 3).task, monsterTags: ['beast' as const] } };
    const restored = normalizeGameState(JSON.parse(JSON.stringify({ ...base, quests: [quest] })));
    expect(restored.inventoryPolicy).toEqual(base.inventoryPolicy);
    expect(restored.townReturnMode).toBe('auto-play');
    expect(restored.autopilot).toEqual(base.autopilot);
    expect(restored.quests.find((item) => item.id === quest.id)?.task.monsterTags).toEqual(['beast']);
    expect(restored.maze.layout).toEqual(maze.layout);
    expect(restored.maze.cells).toEqual(maze.cells);
    expect(restored.floors.find((floor) => floor.level === 2)?.maze.layout?.connections).toEqual(maze.layout.connections);
    expect(createNewGameState().inventoryPolicy).toBeUndefined();
  });

  it('suppresses both stairs during route traversal and allows only explicit work-complete descent', () => {
    const base = createNewGameState({ maze: lineMaze(4, [], 1, 0, 2), chests: [chestAt(3)], floors: [{ level: 2, maze: lineMaze(3), mazeMaxRooms: 42 }] });
    const atExit = moveActive(base, 'east', { triggerStairs: false });
    expect(atExit.dungeonLevel).toBe(1);
    expect(atExit.maze.active.column).toBe(2);
    expect(descendFloor(atExit)).toBe(atExit);
    const withQuest = { ...atExit, chests: [], quests: [questFor(roomAt('missing', 'safe', 3), 'scout')] };
    expect(descendFloor(withQuest)).toBe(withQuest);
    const ready = { ...atExit, chests: [], quests: [] };
    expect(descendFloor(ready).dungeonLevel).toBe(2);
    const atStart = moveActive(base, 'west', { triggerStairs: false });
    expect(atStart.mode).toBe('manual');
    expect(atStart.maze.active).toEqual(base.maze.start);
    expect(descendFloor(atStart)).toBe(atStart);
  });

  it('invalidates another floor route and retains absent optional fields for old saves', () => {
    const base = createNewGameState({ maze: lineMaze(3) });
    const restored = normalizeGameState({ ...base, autopilot: { phase: 'travel', floor: 2, route: ['east'], targetId: 'old', targetPosition: { row: 0, column: 1 }, stalledTicks: 0, reason: 'Old floor' } });
    expect(restored.autopilot).toMatchObject({ phase: 'planning', floor: 1, route: [] });
    expect(restored.autopilot?.targetId).toBeUndefined();
    expect(normalizeGameState(base).inventoryPolicy).toBeUndefined();
    expect(normalizeGameState(base).townReturnMode).toBeUndefined();
    expect(normalizeGameState(base).maze.layout).toBeUndefined();
  });

  it('does not resurrect or repay duplicate claimed quest records during normalization', () => {
    const room = roomAt('boss', 'boss', 1);
    const quest = questFor(room, 'kill', 3);
    const base = createNewGameState({ maze: lineMaze(3, [room]) });
    const claimed = { ...quest, status: 'claimed' as const, task: { ...quest.task, progress: 3 } };
    const normalized = normalizeGameState({ ...base, quests: [quest, claimed, quest] });
    expect(normalized.quests).toHaveLength(1);
    expect(normalized.quests[0].status).toBe('claimed');
    expect(normalized.inventory.gold).toBe(base.inventory.gold);
    expect(normalizeGameState(normalized).inventory.gold).toBe(base.inventory.gold);
  });
});

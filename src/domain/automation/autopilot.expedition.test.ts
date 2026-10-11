import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState, moveActive, normalizeGameState, setGameMode } from '../gameFactory';
import { advanceBattleRound } from '../combat/battleEngine';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import * as solver from '../maze/solver';
import type { GameState } from '../types';
import { advanceAutopilot, nextAutoIntent, stopAutopilot } from './autopilot';
import { chestAt, lineMaze, questFor, roomAt, seededRng } from './autopilotTestFixtures';

afterEach(() => vi.restoreAllMocks());

describe('persistent expedition runner', () => {
  it('finishes all synthetic floor work across incidental up/down stairs before descending, including save/resume', () => {
    const rooms = [roomAt('hub', 'hub', 0), roomAt('exit', 'exit', 2), roomAt('safe', 'safe', 4), roomAt('boss', 'boss', 6), roomAt('treasure', 'treasure', 8)];
    let game = createNewGameState({
      mode: 'auto-play', randomBattles: false, maze: lineMaze(9, rooms, 0, 3, 2), chests: [chestAt(1), chestAt(8)],
      floors: [{ level: 2, maze: lineMaze(3), mazeMaxRooms: 42 }],
    });
    const flags = [true, false, true];
    game = { ...game, party: game.party.map((actor, index) => ({ ...actor, autoBattle: flags[index] })) };
    expect(game.quests).toEqual([]);
    game = advanceAutopilot(game, () => 0.1, 0);
    const ids = game.quests.map((quest) => quest.id);
    expect(new Set(game.quests.map((quest) => quest.task.objective)).size).toBe(4);
    let sawIncidentalExit = false;
    let sawIncidentalStart = false;
    let rounds = 0;
    for (let tick = 0; tick < 200 && game.dungeonLevel === 1; tick++) {
      const wasBattle = game.battle?.status === 'active';
      const previous = game;
      game = wasBattle ? advanceBattleRound(game, () => 0.1, 1000 + tick * 1000) : advanceAutopilot(game, () => 0.1, 1000 + tick * 1000);
      if (wasBattle) rounds++;
      if (tick === 3 || (wasBattle && rounds === 2)) game = normalizeGameState(JSON.parse(JSON.stringify(game)));
      expect(game.mode, game.autopilot?.reason).not.toBe('town');
      expect(game.autopilot?.phase, game.autopilot?.reason).not.toBe('blocked');
      expect(game.party.map((actor) => actor.autoBattle)).toEqual(flags);
      expect(game.party[1].gcdUntil).toBeUndefined();
      if (game.dungeonLevel === 1 && game.maze.active.column === 2) sawIncidentalExit = true;
      if (game.dungeonLevel === 1 && game.maze.active.column === 3) sawIncidentalStart = true;
      if (game.dungeonLevel === 2) {
        expect(previous.maze.active).toEqual(previous.maze.end);
        expect(previous.chests.filter((chest) => chest.level === 1).every((chest) => chest.opened)).toBe(true);
        expect(previous.quests.filter((quest) => ids.includes(quest.id)).every((quest) => quest.status === 'claimed')).toBe(true);
      }
    }
    expect(sawIncidentalExit && sawIncidentalStart).toBe(true);
    expect(rounds).toBeGreaterThan(3);
    expect(game.dungeonLevel).toBe(2);
    expect(game.quests.filter((quest) => ids.includes(quest.id)).every((quest) => quest.status === 'claimed')).toBe(true);
  });

  it.each([1, 7, 42, 99])('completes a seeded generated floor with every quest/chest claimed (seed %i)', (seed) => {
    const rng = seededRng(seed);
    let game = createNewGameState({
      mode: 'auto-play', randomBattles: false, maze: generateStructuredMaze(42, 46, rng),
      floors: [{ level: 2, maze: generateStructuredMaze(9, 13, rng), mazeMaxRooms: 42 }],
    });
    // Qualify navigation/progress independently from encounter balance and inventory care.
    game = { ...game, party: game.party.map((actor) => ({ ...actor, hp: 2000, maxHp: 2000, combat: { ...actor.combat, baseDamage: 100 } })) };
    expect(game.quests).toEqual([]);
    game = advanceAutopilot(game, rng, 0);
    const ids = game.quests.map((quest) => quest.id);
    expect(new Set(game.quests.map((quest) => quest.task.objective)).size).toBe(4);
    for (let tick = 0; tick < 2000 && game.dungeonLevel === 1 && game.autopilot?.phase !== 'blocked'; tick++) {
      game = game.battle?.status === 'active' ? advanceBattleRound(game, rng, 1000 + tick * 1000) : advanceAutopilot(game, rng, 1000 + tick * 1000);
    }
    expect(game.autopilot?.phase, game.autopilot?.reason).not.toBe('blocked');
    expect(game.dungeonLevel).toBe(2);
    expect(game.quests.filter((quest) => ids.includes(quest.id)).every((quest) => quest.status === 'claimed')).toBe(true);
    expect(game.chests.filter((chest) => chest.level === 1).every((chest) => chest.opened)).toBe(true);
  });

  it('keeps a persistent objective and route batch without searching again each movement tick', () => {
    const search = vi.spyOn(solver, 'createMazePathSearch');
    let game = createNewGameState({ mode: 'auto-play', randomBattles: false, maze: lineMaze(12), chests: [chestAt(9)] });
    game = advanceAutopilot(game, () => 0.5);
    const target = game.autopilot!.targetId;
    expect(game.autopilot?.route).toHaveLength(8);
    game = advanceAutopilot(game, () => 0.5);
    game = advanceAutopilot(game, () => 0.5);
    expect(game.autopilot?.targetId).toBe(target);
    expect(game.autopilot?.route).toHaveLength(6);
    expect(search).toHaveBeenCalledTimes(1);
    const resumed = normalizeGameState(JSON.parse(JSON.stringify(game)));
    expect(advanceAutopilot(resumed, () => 0.5).autopilot?.route).toHaveLength(5);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('stops immediately, preserves actor flags, and replans after manual repositioning on resume', () => {
    const base = createNewGameState({ mode: 'auto-play', randomBattles: false, maze: lineMaze(8), chests: [chestAt(6)] });
    const flags = [false, true, false];
    const game = advanceAutopilot({ ...base, party: base.party.map((actor, index) => ({ ...actor, autoBattle: flags[index] })) }, () => 0.5);
    const stopped = stopAutopilot(game);
    const rng = vi.fn(() => 0.5);
    expect(advanceAutopilot(stopped, rng)).toBe(stopped);
    expect(rng).not.toHaveBeenCalled();
    expect(stopped.party.map((actor) => actor.autoBattle)).toEqual(flags);
    const moved = moveActive(stopped, 'west', { triggerStairs: false });
    const resumed = advanceAutopilot(setGameMode(moved, 'auto-play'), rng);
    expect(resumed.maze.active.column).toBe(1);
    expect(resumed.autopilot?.route).toHaveLength(5);
  });

  it('reports a missing chest/target and can resume after repair without dropping the quest', () => {
    const treasure = roomAt('treasure', 'treasure', 3);
    const quest = questFor(treasure, 'fetch');
    const base = createNewGameState({ mode: 'auto-play', randomBattles: false, maze: lineMaze(5, [treasure]) });
    const broken = advanceAutopilot({ ...base, quests: [quest], chests: [] }, () => 0.5);
    expect(broken.mode).toBe('manual');
    expect(broken.autopilot).toMatchObject({ phase: 'blocked', reason: expect.stringContaining('Missing obtainable chest') });
    expect(broken.quests[0].status).toBe('active');
    const missingRoom = advanceAutopilot({ ...base, quests: [{ ...quest, targetRoomId: 'gone' }] }, () => 0.5);
    expect(missingRoom.autopilot?.reason).toContain('Missing target room');
    let repaired: GameState = { ...broken, mode: 'auto-play', chests: [chestAt(3)] };
    for (let tick = 0; tick < 4; tick++) repaired = advanceAutopilot(repaired, () => 0.5);
    expect(repaired.quests[0].status).toBe('claimed');
    expect(repaired.autopilot?.phase).not.toBe('blocked');
  });

  it('blocks unreachable chests and missing exit cells instead of descending or looping', () => {
    const base = createNewGameState({ mode: 'auto-play', maze: lineMaze(3), chests: [chestAt(1)] });
    const isolated = { ...base.maze, cells: base.maze.cells.map((cell) => ({ ...cell, links: [] })) };
    const blocked = advanceAutopilot({ ...base, maze: isolated }, () => 0.5);
    expect(blocked.autopilot?.reason).toContain('No reachable target');
    expect(blocked.dungeonLevel).toBe(1);
    const missingExit = advanceAutopilot({ ...base, chests: [], maze: { ...base.maze, end: { row: 10, column: 10 } } }, () => 0.5);
    expect(missingExit.autopilot?.phase).toBe('blocked');
  });

  it('bounds a malformed room interaction that cannot update its objective', () => {
    const room = { ...roomAt('bad-center', 'safe', 2), center: { row: 0, column: 1 } };
    const base = createNewGameState({ mode: 'auto-play', randomBattles: false, maze: lineMaze(4, [room]) });
    let game: GameState = { ...base, chests: [], quests: [questFor(room, 'scout')] };
    game = advanceAutopilot(game, () => 0.5);
    game = advanceAutopilot(game, () => 0.5);
    expect(game.autopilot?.reason).toContain('Interaction made no progress');
    expect(game.mode).toBe('manual');
  });

  it('leaves battle rounds and town maintenance to the host; inspection can explicitly request descent', () => {
    const boss = roomAt('boss', 'boss', 0);
    const base = createNewGameState({ mode: 'auto-play', maze: lineMaze(3, [boss]) });
    const battling = advanceAutopilot({ ...base, quests: [questFor(boss, 'kill')] }, () => 0.5);
    expect(battling.battle?.origin?.roomId).toBe('boss');
    expect(advanceAutopilot(battling, () => 0.5)).toBe(battling);
    const town = { ...base, mode: 'town' as const, townReturnMode: 'auto-play' as const };
    expect(advanceAutopilot(town, () => 0.5)).toBe(town);
    const atExit = { ...base, quests: [], chests: [], maze: { ...base.maze, active: base.maze.end } };
    expect(nextAutoIntent(atExit).type).toBe('descend');
  });

  it('resumes the cached objective route after an incidental random encounter', () => {
    const base = createNewGameState({ mode: 'auto-play', randomBattles: true, maze: lineMaze(12), chests: [chestAt(9)] });
    let game = advanceAutopilot(base, () => 0.1);
    expect(game.battle?.origin?.position).toEqual({ row: 0, column: 1 });
    const route = game.autopilot!.route;
    const targetId = game.autopilot!.targetId;
    for (let tick = 0; tick < 30 && game.battle; tick++) game = advanceBattleRound(game, () => 0.1, 1000 + tick * 1000);
    expect(game.battle).toBeUndefined();
    expect(game.autopilot?.route).toEqual(route);
    const continued = advanceAutopilot({ ...game, randomBattles: false }, () => 0.1);
    expect(continued.maze.active.column).toBe(2);
    expect(continued.autopilot?.targetId).toBe(targetId);
    expect(continued.autopilot?.route).toEqual(route.slice(1));
  });
});

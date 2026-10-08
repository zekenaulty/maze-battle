import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { cellKey, samePosition } from '../maze/key';
import { linkMap, movePosition, opposite } from '../maze/movement';
import { createMazePathSearch } from '../maze/solver';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import { isInRoom } from '../quests/questTargets';
import { qualifyExpedition, unfinishedFloor, type QualificationCase } from './autopilotQualification.testSupport';
import { advanceAutopilot } from './autopilot';
import { seededRng } from './autopilotTestFixtures';

const seeds = Array.from({ length: 20 }, (_, index) => index + 1);
const sizes = [{ rows: 9, columns: 13 }, { rows: 31, columns: 37 }];

describe('combined v2 topology with unboosted expedition parties', () => {
  it.each(sizes)('qualifies quest-only and normal-encounter runs on $rows x $columns', (size) => {
    const results = [false, true].flatMap((randomBattles) => seeds.map((seed) => {
      const options = { ...size, seed, randomBattles };
      const result = qualifyExpedition(options, (before, after) => assertTransition(before, after, options));
      assertReachableObjectives(result.initial);
      expect(result.outcome, JSON.stringify({ options, reason: result.game.autopilot?.reason })).not.toBe('blocked');
      expect(result.outcome, JSON.stringify(options)).not.toBe('budget');
      if (result.outcome === 'complete') {
        expect(unfinishedFloor(result.game), JSON.stringify(options)).toBe(false);
        const saved = result.game.floors.find((floor) => floor.level === 1)!;
        expect(saved.maze.layout).toEqual(result.initial.maze.layout);
        expect(saved.maze.cells).toEqual(result.initial.maze.cells);
      } else {
        expect(result.game.party.every((actor) => actor.hp === 0)).toBe(true);
        expect(result.game.autopilot?.reason).toContain('Party defeated');
      }
      return result;
    }));
    console.info('UNBOOSTED_V2', JSON.stringify({
      ...size,
      cohorts: [false, true].map((randomBattles) => {
        const cohort = results.filter((result) => result.options.randomBattles === randomBattles);
        return {
          randomBattles, completed: cohort.filter((result) => result.outcome === 'complete').length,
          lost: cohort.filter((result) => result.outcome === 'lost').map((result) => ({
            seed: result.options.seed, ticks: result.ticks, moves: result.moves, battles: result.battles, kills: result.kills,
          })),
          partialKillTurns: cohort.reduce((total, result) => total + result.partialKillTurns, 0),
          partialBattleResumes: cohort.filter((result) => result.resumedPartialBattle).length,
          incidentalExitVisits: cohort.reduce((total, result) => total + result.incidentalExitVisits, 0),
        };
      }),
      firstLoss: results.find((result) => result.outcome === 'lost')?.lastEncounter,
    }));
    expect(results.filter((result) => result.outcome !== 'complete').map((result) => ({ options: result.options, outcome: result.outcome, encounter: result.lastEncounter }))).toEqual([]);
    expect(results.some((result) => result.partialKillTurns > 1)).toBe(true);
    expect(results.some((result) => result.resumedPartialBattle)).toBe(true);
  }, 60000);

  it.each(sizes.flatMap((size) => [1, 7, 20].map((seed) => ({ ...size, seed }))))(
    'resumes legal saved routes across both stairs without leaving a $rows x $columns v2 floor (seed $seed)',
    ({ rows, columns, seed }) => {
      const base = createNewGameState({ maze: generateStructuredMaze(rows, columns, seededRng(seed)), mode: 'auto-play', randomBattles: false });
      for (const exit of [false, true]) {
        const active = exit ? { row: rows - 2, column: columns - 1 } : { row: 0, column: 1 };
        const target = exit ? { row: rows - 1, column: columns - 2 } : { row: 1, column: 0 };
        const stair = exit ? base.maze.end : base.maze.start;
        const id = `saved-route-${exit ? 'exit' : 'entry'}`;
        let game = normalizeGameState({
          ...base,
          maze: { ...base.maze, active },
          chests: [...base.chests, { id, level: 1, position: target, opened: false }],
          autopilot: {
            phase: 'travel', floor: 1, targetId: `chest:${id}`, targetPosition: target,
            route: exit ? ['south', 'west'] : ['west', 'south'], lastPosition: active, stalledTicks: 0, reason: 'Saved route across stairs',
          },
        });
        const layout = game.maze.layout;
        for (let tick = 0; tick < 3 && samePosition(game.maze.active, active); tick++) game = advanceAutopilot(game, () => 0.5);
        expect(game.maze.active).toEqual(stair);
        expect(game.dungeonLevel).toBe(1);
        expect(game.mode).toBe('auto-play');
        expect(unfinishedFloor(game)).toBe(true);
        game = advanceAutopilot(game, () => 0.5);
        expect(game.maze.active).toEqual(target);
        expect(game.chests.find((chest) => chest.id === id)?.opened).toBe(true);
        expect(game.dungeonLevel).toBe(1);
        expect(game.maze.layout).toEqual(layout);
      }
    },
  );
});

function assertReachableObjectives(game: GameState) {
  const paths = createMazePathSearch(game.maze, game.maze.start);
  expect(game.maze.layout?.version).toBe('structured-v2');
  expect(game.maze.layout?.connections?.length).toBeGreaterThan(0);
  const linked = game.maze.cells.filter((cell) => cell.links.length > 0);
  expect(paths.visitedCount).toBe(linked.length);
  for (const chest of game.chests.filter((chest) => chest.level === 1)) expect(paths.distanceTo(chest.position)).toBeLessThan(Infinity);
  for (const quest of game.quests.filter((quest) => quest.floor === 1)) {
    const room = game.maze.layout!.rooms.find((room) => room.id === quest.targetRoomId)!;
    expect(paths.distanceTo(room.center)).toBeLessThan(Infinity);
    if (quest.task.objective === 'fetch') expect(game.chests.some((chest) => chest.level === 1 && isInRoom(chest.position, room))).toBe(true);
  }
}

function assertTransition(before: GameState, after: GameState, options: QualificationCase) {
  const label = JSON.stringify(options);
  expect(after.mode, label).not.toBe('town');
  if (after.dungeonLevel !== before.dungeonLevel) {
    expect(samePosition(before.maze.active, before.maze.end), label).toBe(true);
    expect(unfinishedFloor(before), label).toBe(false);
    expect(before.battle, label).toBeUndefined();
  } else if (!samePosition(before.maze.active, after.maze.active)) {
    expect(before.battle, label).toBeUndefined();
    expect(movePosition(before.maze.active, after.facing), label).toEqual(after.maze.active);
    expect(before.maze.cells.find((cell) => samePosition(cell, before.maze.active))?.links, label).toContain(after.facing);
    expect(after.maze.cells.find((cell) => samePosition(cell, after.maze.active))?.links.length, label).toBeGreaterThan(0);
  }
  if (before.autopilot?.route !== after.autopilot?.route || !samePosition(before.maze.active, after.maze.active)) assertRoute(after, label);
  if (before.battle?.status !== 'active') return;
  const remaining = new Set(after.battle?.enemies.map((enemy) => enemy.id) ?? []);
  const removed = before.battle.enemies.filter((enemy) => !remaining.has(enemy.id));
  const origin = before.battle.origin!;
  for (const quest of before.quests.filter((quest) => quest.task.objective === 'kill')) {
    const matching = origin.floor === quest.floor && origin.roomId === quest.targetRoomId
      ? removed.filter((enemy) => !quest.task.monsterTags?.length || quest.task.monsterTags.some((tag) => enemy.tags.includes(tag))).length : 0;
    const expected = Math.min(quest.task.required, quest.task.progress + matching);
    expect(after.quests.find((item) => item.id === quest.id)?.task.progress, label).toBe(expected);
  }
  if (after.battle) {
    expect(after.battle.origin, label).toEqual(origin);
    expect(after.battle.defeated?.length, label).toBe((before.battle.defeated?.length ?? 0) + removed.length);
    expect(new Set(after.battle.defeated?.map((enemy) => enemy.id)).size, label).toBe(after.battle.defeated?.length ?? 0);
  }
}

function assertRoute(game: GameState, label: string) {
  const state = game.autopilot;
  if (!state) return;
  expect(state.floor, label).toBe(game.dungeonLevel);
  expect(state.lastPosition, label).toEqual(game.maze.active);
  if (!state.targetPosition || state.phase === 'blocked') return;
  const cells = linkMap(game.maze);
  let position = game.maze.active;
  for (const direction of state.route) {
    expect(cells.get(cellKey(position))?.links, label).toContain(direction);
    position = movePosition(position, direction);
    expect(cells.get(cellKey(position))?.links, label).toContain(opposite(direction));
  }
  expect(position, label).toEqual(state.targetPosition);
}

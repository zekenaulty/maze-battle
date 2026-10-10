import type { GameState } from '../types';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { advanceBattleRound } from '../combat/battleEngine';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import { samePosition } from '../maze/key';
import { advanceAutopilot } from './autopilot';
import { seededRng } from './autopilotTestFixtures';

export interface QualificationCase {
  rows: number;
  columns: number;
  seed: number;
  randomBattles: boolean;
}

export function qualifyExpedition(options: QualificationCase, observe: (before: GameState, after: GameState) => void = () => {}) {
  const maze = generateStructuredMaze(options.rows, options.columns, seededRng(options.seed));
  const nextFloor = generateStructuredMaze(9, 13, seededRng(options.seed + 10000));
  const initial = createNewGameState({
    maze, mode: 'auto-play', randomBattles: options.randomBattles,
    floors: [{ level: 2, maze: nextFloor, mazeMaxRooms: 42 }],
  });
  const rng = seededRng(options.seed ^ 0x9e3779b9);
  let game = initial;
  let ticks = 0;
  let moves = 0;
  let battles = 0;
  let battleRounds = 0;
  let kills = 0;
  let partialKillTurns = 0;
  let resumedPartialBattle = false;
  let incidentalExitVisits = 0;
  let lastEncounter: ReturnType<typeof encounterSummary> | undefined;
  let now = Date.UTC(2026, 9, 8);
  for (; ticks < 3000 && game.dungeonLevel === 1 && game.autopilot?.phase !== 'blocked'; ticks++) {
    const before = game;
    now += before.battle ? before.autoThrottleMs : Math.max(750, before.autoThrottleMs);
    if (before.battle?.status === 'active') {
      game = advanceBattleRound(before, rng, now);
      battleRounds++;
      const remaining = new Set(game.battle?.enemies.map((enemy) => enemy.id) ?? []);
      const removed = before.battle.enemies.filter((enemy) => !remaining.has(enemy.id));
      kills += removed.length;
      if (removed.length && game.battle?.status === 'active') partialKillTurns++;
    } else {
      game = advanceAutopilot(before, rng, now);
      if (game.battle) {
        battles++;
        lastEncounter = encounterSummary(game);
      }
    }
    if (game.dungeonLevel === before.dungeonLevel && !samePosition(game.maze.active, before.maze.active)) {
      moves++;
      if (samePosition(game.maze.active, game.maze.end) && unfinishedFloor(game)) incidentalExitVisits++;
    }
    observe(before, game);
    if (!resumedPartialBattle && game.battle?.status === 'active' && (game.battle.defeated?.length ?? 0) > 0) {
      game = normalizeGameState(JSON.parse(JSON.stringify(game)));
      resumedPartialBattle = true;
    }
  }
  const outcome = game.dungeonLevel === 2 ? 'complete' : game.battle?.status === 'lost' ? 'lost'
    : game.autopilot?.phase === 'blocked' ? 'blocked' : 'budget';
  return { options, initial, game, outcome, ticks, moves, battles, battleRounds, kills, partialKillTurns, resumedPartialBattle, incidentalExitVisits, lastEncounter };
}

export function unfinishedFloor(game: GameState) {
  return game.quests.some((quest) => quest.floor === 1 && quest.status !== 'claimed')
    || game.chests.some((chest) => chest.level === 1 && !chest.opened);
}

function encounterSummary(game: GameState) {
  return {
    position: game.battle!.origin!.position,
    roomId: game.battle!.origin!.roomId,
    enemies: game.battle!.enemies.map((enemy) => ({ level: enemy.level, hp: enemy.hp, monsterId: enemy.monsterId })),
    party: game.party.map((actor) => ({ role: actor.role, level: actor.level, hp: actor.hp, mp: actor.mp })),
  };
}

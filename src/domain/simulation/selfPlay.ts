import { createNewGameState } from '../gameFactory';
import { advanceAutomaticPlay } from '../automation/autoPlay';
import { automaticStepDelay } from '../automation/schedule';
import { generateStructuredMaze } from '../maze/structuredGenerate';
import { monsterTagsForFloor } from '../combat/monsters';
import type { Rng } from '../combat/rng';
import type { GameState } from '../types';
import { createPlayTelemetry, recordTransition } from '../telemetry/transitions';
import type { PlayTelemetry } from '../telemetry/types';
import { METRIC_SEMANTICS } from '../telemetry/types';
import { inventoryDiagnostics } from '../items/inventoryDiagnostics';

export interface SelfPlayOptions {
  seed: number;
  floors: number;
  maxSteps: number;
  rows?: number;
  columns?: number;
  encounters?: boolean;
}

export interface SelfPlayRun {
  options: SelfPlayOptions;
  game: GameState;
  telemetry: PlayTelemetry;
  rng: Rng;
  steps: number;
  now: number;
  outcome: 'running' | 'complete' | 'blocked' | 'defeated' | 'step-limit' | 'cancelled';
  reason: string;
}

export function createSelfPlay(options: SelfPlayOptions): SelfPlayRun {
  const config = {
    ...options, seed: Math.floor(options.seed) >>> 0,
    floors: bounded(options.floors, 3, 1, 10),
    maxSteps: bounded(options.maxSteps, 10000, 1, 50000),
    rows: bounded(options.rows, 9, 9, 96),
    columns: bounded(options.columns, 13, 13, 100),
  };
  const rng = seededRng(config.seed);
  const floors = Array.from({ length: config.floors + 1 }, (_, index) => ({
    level: index + 1, mazeMaxRooms: 32,
    monsterTags: monsterTagsForFloor(index + 1), maze: generateStructuredMaze(config.rows, config.columns, rng),
  }));
  const game = createNewGameState({ mode: 'auto-play', maze: floors[0].maze, floors, randomBattles: config.encounters !== false, autoThrottleMs: 250 });
  return { options: config, game, telemetry: createPlayTelemetry(game.id, 0), rng, steps: 0, now: 1000000, outcome: 'running', reason: '' };
}

// The harness owns its state. Neither this function nor the UI writes simulation saves.
export function stepSelfPlay(run: SelfPlayRun, batchSize = 100): SelfPlayRun {
  for (let index = 0; index < batchSize && run.outcome === 'running'; index++) {
    const before = run.game;
    const now = run.now += automaticStepDelay(before);
    const started = performance.now();
    run.game = advanceAutomaticPlay(before, run.rng, now);
    run.telemetry = recordTransition(run.telemetry, before, run.game, {
      action: before.battle ? 'battle-tick' : 'auto-step', source: 'auto', elapsedMs: performance.now() - started,
    }, now);
    run.steps++;
    if (run.game.battle?.status === 'lost') run.outcome = 'defeated';
    else if (run.game.autopilot?.phase === 'blocked') run.outcome = 'blocked';
    else if (run.game.dungeonLevel > run.options.floors) run.outcome = 'complete';
    else if (run.steps >= run.options.maxSteps) run.outcome = 'step-limit';
    run.reason = run.outcome === 'complete' ? `Cleared ${run.options.floors} floors.` :
      run.outcome === 'step-limit' ? 'Reached the configured step limit.' : run.game.autopilot?.reason ?? run.outcome;
  }
  return run;
}

export function selfPlayReport(run: SelfPlayRun) {
  return {
    format: 'maze-battle-self-play-v1', options: run.options, outcome: run.outcome, reason: run.reason,
    metricSemantics: METRIC_SEMANTICS,
    inventoryDiagnostics: inventoryDiagnostics(run.game),
    steps: run.steps, finalFloor: run.game.dungeonLevel, counters: run.telemetry.counters,
    remaining: {
      chests: run.game.chests.filter(c => c.level <= run.options.floors && !c.opened).map(c => c.id),
      quests: run.game.quests.filter(q => q.floor <= run.options.floors && q.status === 'active').map(q => q.id),
    },
    telemetry: run.telemetry, snapshot: run.game,
  };
}

function seededRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback;
}

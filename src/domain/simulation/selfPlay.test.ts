import { describe, expect, it } from 'vitest';
import { createSelfPlay, selfPlayReport, stepSelfPlay } from './selfPlay';

describe('bounded self-play', () => {
  it('completes a seeded floor with a normal party and no unfinished objectives', () => {
    const run = createSelfPlay({ seed: 42, floors: 1, maxSteps: 5000 });
    while (run.outcome === 'running') stepSelfPlay(run);
    expect(run.outcome).toBe('complete');
    expect(run.telemetry.counters.prematureDescents).toBe(0);
    expect(selfPlayReport(run).remaining).toEqual({ chests: [], quests: [] });
    expect(run.telemetry.counters.chests).toBeGreaterThan(0);
    expect(run.telemetry.counters.quests).toBeGreaterThan(0);
  });

  it('normalizes invalid limits and terminates at the configured bound', () => {
    const run = createSelfPlay({ seed: 1, floors: NaN, maxSteps: 1, rows: Infinity });
    expect(run.options.floors).toBe(3);
    expect(run.options.rows).toBe(9);
    stepSelfPlay(run);
    expect(run.outcome).toBe('step-limit');
    expect(run.steps).toBe(1);
  });

  it('repeats decisions and outcomes for the same seed, independent of generated IDs', () => {
    const counts = Array.from({ length: 2 }, () => {
      const run = createSelfPlay({ seed: 7, floors: 3, maxSteps: 5000 });
      while (run.outcome === 'running') stepSelfPlay(run);
      const { totalDecisionMs: _total, maxDecisionMs: _peak, ...counters } = run.telemetry.counters;
      return { outcome: run.outcome, steps: run.steps, counters };
    });
    expect(counts[0]).toEqual(counts[1]);
  });
});

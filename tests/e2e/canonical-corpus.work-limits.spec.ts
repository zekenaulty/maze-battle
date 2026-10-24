import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { measuredMove } from './canonical-corpus.work';
import type { CanonicalWorkLimits } from '../../src/persistence/canonical/types';
import { DEFAULT_WORK_LIMITS } from '../../src/persistence/canonical/types';

test('same earned move has equal read/write/byte threshold outcomes and truthful diagnostics', async ({ browser }, info) => {
  const pairs = [];
  async function pair(limits: CanonicalWorkLimits) {
    const samples = [], boots = [];
    for (const variant of ['A', 'B'] as const) {
      const fixture = await corpusBrowser(browser, { controlled: true });
      try {
        boots.push(await fixture.page.evaluate(variant => window.canonicalCorpus.boot(variant), variant));
        samples.push(await measuredMove(fixture.page, true, limits));
      } finally { await fixture.close(); }
    }
    const value = { limits, boots, samples }; pairs.push(value);
    expect(boots[0].surface.raw).toEqual(boots[1].surface.raw);
    expect(samples[0].error).toEqual(samples[1].error);
    expect(samples[0].after.checkpoint).toEqual(samples[1].after.checkpoint);
    expect(samples[0].status.status).toBe(samples[1].status.status);
    expect(samples[0].status.controlled).toBe(samples[1].status.controlled);
    expect(samples[0].status.recoveryRequired).toBe(samples[1].status.recoveryRequired);
    expect(samples[0].status.diagnostics.map(({ elapsedMs: _duration, ...diagnostic }) => diagnostic))
      .toEqual(samples[1].status.diagnostics.map(({ elapsedMs: _duration, ...diagnostic }) => diagnostic));
    for (const sample of samples) {
      const bytes = sample.databaseAfter!.filter(row => row.store !== 'meta').reduce((total, row) => total
        + row.values.reduce<number>((sum, value, i) => sum + Buffer.byteLength(JSON.stringify([row.store, row.keys[i], value])), 0), 0);
      expect(bytes).toBe(sample.after.head.quota.usedBytes);
    }
    return value;
  }
  try {
    const baseline = await pair({ ...DEFAULT_WORK_LIMITS });
    expect(baseline.samples.map(sample => sample.error)).toEqual([null, null]);
    const stats = baseline.samples[0].status.diagnostics.at(-1)!.stats;
    const boundary: CanonicalWorkLimits = { reads: stats.reads, writes: stats.writes, bytes: stats.readBytes + stats.writeBytes };
    for (const dimension of ['reads', 'writes', 'bytes'] as const) {
      expect(boundary[dimension]).toBeGreaterThan(1); expect(boundary[dimension]).toBeLessThan(DEFAULT_WORK_LIMITS[dimension]);
      for (const offset of [-1, 0, 1]) {
        const current = await pair({ ...DEFAULT_WORK_LIMITS, [dimension]: boundary[dimension] + offset });
        await evidence(info, `work-${dimension}-${offset}.json`, current);
        for (const sample of current.samples) {
          if (offset < 0) {
            expect(sample.error).toContain('budget exhausted'); expect(sample.after).toEqual(sample.before);
            expect(sample.databaseAfter).toEqual(sample.databaseBefore);
          } else {
            expect(sample.error).toBeNull();
            expect(sample.after.checkpoint.position).not.toEqual(sample.before.checkpoint.position);
            expect(sample.receipts[0].result).toEqual(baseline.samples[0].receipts[0].result);
            expect(sample.status.diagnostics.at(-1)!.stats).toEqual(stats);
          }
        }
      }
    }
    await evidence(info, 'work-limits-verdict.json', { boundary, stats, dimensions: ['reads', 'writes', 'bytes'],
      outcomes: 'PASS at all three neighbors in each dimension',
      scope: 'One actual shared command at the authored common earned prefix; no duration equality or general-world claim' });
  } finally {
    await evidence(info, 'work-limits-raw.json', pairs);
  }
});

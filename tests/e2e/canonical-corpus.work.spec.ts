import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { injectQuota, measuredMove, quotaBoundary } from './canonical-corpus.work';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('private-world allocation keeps the same earned move equivalent at quota threshold neighbors', async ({ browser }, info) => {
  const files = new Set(execFileSync('git', ['ls-files', 'src', 'tests/e2e/canonical-corpus*'], { encoding: 'utf8' }).trim().split(/\r?\n/));
  files.add('tests/e2e/canonical-corpus.work.ts'); files.add('tests/e2e/canonical-corpus.work.spec.ts');
  const hashes = Object.fromEntries([...files].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  await evidence(info, 'work-provenance.json', { hashes, node: process.version, browser: browser.version(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    boundary: 'Native GameSession plus controlled fault injection; not mounted App or service/provider proof' });
  const samples: Awaited<ReturnType<typeof measuredMove>>[] = [];
  const boots = [], fixtures = [];
  try {
    for (const variant of ['A', 'B'] as const) {
      const fixture = await corpusBrowser(browser, { controlled: true }); fixtures.push(fixture);
      boots.push(await fixture.page.evaluate(variant => window.canonicalCorpus.boot(variant), variant));
      samples.push(await measuredMove(fixture.page, true));
    }
    await evidence(info, 'work-baseline-raw.json', { boots, samples });
    expect(boots[0].surface.raw).toEqual(boots[1].surface.raw);
    expect(samples.map(s => s.error)).toEqual([null, null]);
    expect(samples[0].receipts[0].result).toEqual(samples[1].receipts[0].result);
    expect(samples[0].after.checkpoint).toEqual(samples[1].after.checkpoint);
    expect(samples[0].identities).toEqual(samples[1].identities);
    expect(samples[1].after.head.quota.usedBytes - samples[0].after.head.quota.usedBytes).toBe(4);
    expect(samples[0].after.head.quota.reservedBytes).toBe(0);
    const limit = quotaBoundary(samples[0].after.head);
    expect(quotaBoundary(samples[1].after.head)).toBe(limit);
    const actual = (sample: typeof samples[number]) => sample.databaseAfter!.filter(row => row.store !== 'meta')
      .reduce((total, row) => total + row.values.reduce<number>((sum, value, i) =>
        sum + Buffer.byteLength(JSON.stringify([row.store, row.keys[i], value])), 0), 0);
    for (const sample of samples) expect(actual(sample)).toBe(sample.after.head.quota.usedBytes);
    const neighbors = [];
    for (const offset of [-1, 0, 1]) {
      const faults = [], outcomes = [], faultBoots = [];
      for (const variant of ['A', 'B'] as const) {
        const fixture = await corpusBrowser(browser, { controlled: true }); fixtures.push(fixture);
        faultBoots.push(await fixture.page.evaluate(variant => window.canonicalCorpus.boot(variant), variant));
        faults.push(await injectQuota(fixture.page, limit + offset));
        outcomes.push(await measuredMove(fixture.page, true));
      }
      neighbors.push({ offset, limit: limit + offset, faultBoots, faults, outcomes });
      await evidence(info, `work-threshold-${offset}-raw.json`, neighbors.at(-1));
      expect(faultBoots[0].surface.raw).toEqual(faultBoots[1].surface.raw);
      expect(outcomes[0].error).toEqual(outcomes[1].error);
      expect(outcomes[0].status.status).toEqual(outcomes[1].status.status);
      expect(outcomes[0].after.checkpoint).toEqual(outcomes[1].after.checkpoint);
      for (const [index, outcome] of outcomes.entries()) {
        expect(faults[index].before).toEqual(samples[index].before.head);
        expect(outcome.before.head).toEqual(faults[index].after);
        expect(outcome.after.head.quota.limitBytes).toBe(limit + offset);
        expect(actual(outcome)).toBe(outcome.after.head.quota.usedBytes);
        if (offset < 0) {
          expect(outcome.error).toContain('storage quota exhausted');
          expect(outcome.after).toEqual(outcome.before);
          expect(outcome.databaseAfter).toEqual(outcome.databaseBefore);
        } else {
          expect(outcome.error).toBeNull();
          expect(outcome.after.checkpoint.position).not.toEqual(outcome.before.checkpoint.position);
          expect(outcome.receipts[0].result).toEqual(samples[index].receipts[0].result);
        }
      }
    }
    await evidence(info, 'work-threshold-verdict.json', {
      quotaAdmission: 'PASS', atomicRollback: 'PASS', commonLimitBytes: limit,
      privateWorldBytes: 4, neighbors: neighbors.map(n => ({ offset: n.offset,
        outcomes: n.outcomes.map(o => ({ error: o.error, status: o.status.status })) })),
      baselineWork: samples.map(s => s.status.diagnostics.at(-1)!.stats),
      note: 'Actual authored A/B admission repair. Not universal work/status equivalence or physical-disk proof; no padding or byte normalization.',
    });
    for (const [file, hash] of Object.entries(hashes))
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(hash);
  } finally { for (const fixture of fixtures) await fixture.close(); }
});

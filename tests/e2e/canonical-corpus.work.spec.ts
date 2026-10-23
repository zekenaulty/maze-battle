import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { injectQuota, measuredMove, quotaBoundary } from './canonical-corpus.work';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('characterize hidden-world quota threshold on the same earned move', async ({ browser }, info) => {
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
      samples.push(await measuredMove(fixture.page));
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
    expect(quotaBoundary(samples[1].after.head) - limit).toBe(4);
    const faults = [], outcomes = [], faultBoots = [];
    for (const variant of ['A', 'B'] as const) {
      const fixture = await corpusBrowser(browser, { controlled: true }); fixtures.push(fixture);
      faultBoots.push(await fixture.page.evaluate(variant => window.canonicalCorpus.boot(variant), variant));
      faults.push(await injectQuota(fixture.page, limit));
      outcomes.push(await measuredMove(fixture.page, true));
    }
    await evidence(info, 'work-threshold-raw.json', { limit, faultBoots, faults, outcomes });
    expect(faultBoots[0].surface.raw).toEqual(faultBoots[1].surface.raw);
    for (const [index, fault] of faults.entries()) {
      expect(fault.before).toEqual(samples[index].before.head);
      expect(outcomes[index].before.head).toEqual(fault.after);
      expect(fault.after.quota.limitBytes).toBe(limit);
    }
    // Characterization of an open acceptance defect, NOT a noninterference pass.
    expect(outcomes[0].error).toBeNull();
    expect(outcomes[0].after.checkpoint.position).not.toEqual(outcomes[0].before.checkpoint.position);
    expect(outcomes[1].error).toContain('storage quota exhausted');
    expect(outcomes[1].status).toMatchObject({ controlled: false, recoveryRequired: true,
      status: 'Action failed: Canonical storage: storage quota exhausted' });
    expect(outcomes[1].after).toEqual(outcomes[1].before);
    expect(outcomes[1].databaseBefore).not.toBeNull();
    expect(outcomes[1].databaseAfter).toEqual(outcomes[1].databaseBefore);
    await evidence(info, 'work-threshold-verdict.json', {
      informationBoundary: 'FAIL', atomicRollback: 'PASS', commonLimitBytes: limit,
      privateWorldBytes: 4, publicOutcomes: outcomes.map(o => ({ error: o.error, status: o.status.status })),
      baselineWork: samples.map(s => s.status.diagnostics.at(-1)!.stats),
      note: 'Passing characterization asserts a reproduced defect, not acceptance. No runtime fix in this increment.',
    });
    for (const [file, hash] of Object.entries(hashes))
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(hash);
  } finally { for (const fixture of fixtures) await fixture.close(); }
});

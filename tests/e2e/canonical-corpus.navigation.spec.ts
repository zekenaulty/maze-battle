import { test, expect, type Browser, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type {} from './canonical-corpus.navigation.entry';
import { installCorpusControl } from './canonical-corpus.control';
import { CORPUS_TIME } from './canonical-corpus.layout';
import { corpusDifferences } from './canonical-corpus.diff';
import type { measuredHost } from './canonical-corpus.navigation.host';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const attach = (info: TestInfo, name: string, value: unknown) => info.attach(name, { body: JSON.stringify(value), contentType: 'application/json' });
type Measured = Awaited<ReturnType<ReturnType<typeof measuredHost>>>;
// Declared before comparison: only wall times and browser physical-storage estimates are excluded from this counter projection.
// All raw work/timing values remain attached. Gameplay, IDs, bytes, failures and ordering are NEVER normalized.
function work(result: Measured) {
  const { native } = result;
  return { commits: result.commits, reads: native.reads, writes: native.writes, readBytes: native.readBytes, writeBytes: native.writeBytes,
    readKeys: native.readKeys, writeKeys: native.writeKeys, forbidden: native.forbidden,
    operations: native.native.operations.map(({ database, store, method, status, records, logicalBytes }) =>
      ({ database, store, method, status, records, logicalBytes })),
    transactions: native.native.transactions.map(({ mode, stores, outcome }) => ({ mode, stores, outcome })) };
}
function checked(result: Measured) {
  expect(result.native.forbidden).toEqual([]);
  expect(result.native.native.operations.every(o => o.status === 'success')).toBe(true);
  expect(result.native.native.operations.filter(o => ['getAll', 'getAllKeys', 'count', 'clear'].includes(o.method))).toEqual([]);
  expect(result.native.native.transactions.every(t => t.outcome === 'complete')).toBe(true);
}
async function browserFixture(browser: Browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  const external: string[] = [], errors: string[] = [], origin = 'http://127.0.0.1:5456';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    external.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await context.addInitScript(installCorpusControl); await page.clock.setFixedTime(CORPUS_TIME);
  await page.goto(`${origin}/tests/e2e/canonical-corpus.navigation.html`);
  await page.waitForFunction(() => !!window.corpusNavigation);
  return { page, context, external, errors };
}

for (const zero of [true, false]) test(`paired navigation: ${zero ? 'zero-step initial history then 6/7' : 'nonzero 6/7 history'}, replay and source refusal`, async ({ browser }, info) => {
  const files = execFileSync('git', ['ls-files', 'src', 'tests/e2e/canonical-corpus*', 'tests/e2e/canonical-decision*',
    'tests/e2e/canonical-revisit.probe.ts', 'tests/e2e/storage-probe.ts'], { encoding: 'utf8' }).trim().split(/\r?\n/);
  // Include untracked candidate fixture bytes as well as the named source base.
  for (const file of ['config.ts', 'vite.ts', 'host.ts', 'journey.ts', 'evidence.ts', 'entry.ts', 'spec.ts', 'tsconfig.json', 'html']) {
    const path = `tests/e2e/canonical-corpus.navigation.${file}`; if (!files.includes(path)) files.push(path);
  }
  const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  await attach(info, 'provenance.json', { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, browser: browser.version(), clock: CORPUS_TIME, uuidSeed: '0x731c0ffe', hashes,
    policy: 'zero-step current public actor; six then one east edges selected only from dispatched cell results',
    evidence: 'native canonical host with explicitly typed offline admission/custody; no service/provider/SDK transport' });
  const fixtures = [await browserFixture(browser), await browserFixture(browser)];
  const boots = [], journeys = [];
  try {
    for (const [index, variant] of (['A', 'B'] as const).entries()) {
      const { page } = fixtures[index], boot = await page.evaluate(v => window.corpusNavigation.boot(v), variant);
      boots.push(boot); await attach(info, `raw-${variant}-boot.json`, boot);
      const stages = [];
      for (const step of (zero ? [0, 6, 7] : [6, 7]) as (0 | 6 | 7)[]) {
        const stage = await page.evaluate(n => window.corpusNavigation.stage(n), step); stages.push(stage);
        await attach(info, `raw-${variant}-stage-${step}.json`, stage);
        for (const measured of [stage.trip, stage.continuation, stage.queries]) checked(measured);
        const trip = stage.trip.value, { history, syntax, unknown } = stage.queries.value;
        expect(trip.admission.result.disposition).toBe('applied'); expect(trip.admission.result.operation).toBeDefined();
        expect(trip.finalProgress.steps).toBe(step === 0 ? 0 : step === 6 ? 6 : 1);
        expect(trip.finalProgress.binding.limits).toEqual({ steps: 64, replans: 4, durationMs: 120000 });
        expect(trip.finalProgress.status).toBe('arrived');
        expect(trip.events).toHaveLength(step === 0 ? 0 : step === 6 ? 6 : 1);
        expect(trip.events.map(e => e.observation.data.navigation)).toEqual(trip.progress.map(p =>
          ({ sequence: p.sequence, steps: p.steps, status: p.status, reason: p.reason })));
        expect(trip.terminal.kind).toBe('decision');
        for (const event of [trip.probe, ...trip.events, trip.terminal]) {
          expect(bytes(event)).toBeLessThanOrEqual(4096); expect(bytes(event.observation)).toBeLessThanOrEqual(2800);
        }
        expect(history.result.disposition).toBe('applied');
        expect(history.result.observation!.data).toEqual({ scope: 'decision', state: 'historical', event: trip.terminal });
        expect(history.binding).toEqual(stage.continuation.value.binding);
        expect(history.result.observation!.revision).toBe(stage.continuation.value.start.observation.revision);
        expect(history.result.observation!.observationId).toBe(`observation-${history.result.evidenceId.slice('result-'.length)}`);
        expect(trip.terminal.observation).not.toEqual(stage.continuation.value.start.observation);
        expect([syntax.result.disposition, unknown.result.disposition]).toEqual(['refused', 'refused']);
        expect(syntax.result.summary).toBe('Invalid arguments for this capability.');
        expect(unknown.result.summary).toBe('Destination is not an earned address on the current dungeon floor.');
        for (const frame of [...trip.selected.selections, trip.admission, history, syntax, unknown]) {
          expect(bytes(frame.result)).toBeLessThanOrEqual(4096);
          expect(bytes(frame.result.observation)).toBeLessThanOrEqual(2800);
        }
        for (const frame of [history, syntax, unknown]) { expect(frame.result.operation).toBeUndefined(); expect(frame.result.completion).toBeUndefined(); }
        expect(stage.after.roots.world).toBe(boot.head.roots.world);
        expect(stage.after.checkpoint).toEqual(stage.queryBefore.checkpoint);
        expect(stage.after.roots.knowledge).toBe(stage.queryBefore.roots.knowledge);
        if (step === 0) expect(stage.after.checkpoint).toEqual(stage.before.checkpoint);
      }
      journeys.push(stages);
      const replay = await page.evaluate(() => window.corpusNavigation.historicalReplay());
      await attach(info, `raw-${variant}-historical-replay.json`, replay);
      expect(replay.unchanged).toBe(true);
      for (const [i, result] of replay.results.entries()) {
        checked(result); expect(result.value).toEqual(stages[i].queries.value.history.result);
        expect(result.commits).toEqual([]); expect(result.native.writes).toBe(0);
        expect(result.native.readKeys.every(key => key.startsWith('agentica/'))).toBe(true);
      }
      const faults = await page.evaluate(() => window.corpusNavigation.faults());
      await attach(info, `raw-${variant}-source-refusals.json`, faults);
      for (const fault of Object.values(faults)) { expect(fault.error).not.toBeNull(); expect(fault.unchanged).toBe(true); }
      expect(faults.missing.error).toContain('missing source receipt');
      expect(faults.inconsistent.error).toContain('historical terminal source changed');
      const final = await page.evaluate(() => window.corpusNavigation.cleanup());
      await attach(info, `raw-${variant}-cleanup.json`, final);
      expect(final.allocations).toEqual({}); expect(final.quota.reservations).toBe(0); expect(final.quota.reservedBytes).toBe(0);
    }
    expect(boots[0].admission.value).toEqual(boots[1].admission.value);
    expect(boots[0].allocations).toEqual(boots[1].allocations);
    const workComparisons = [];
    for (const index of zero ? [0, 1] : [0]) {
      const a = journeys[0][index], b = journeys[1][index];
      expect(a.input).toEqual(b.input); expect(a.sight).toEqual(b.sight); expect(a.allocations).toEqual(b.allocations);
      for (const key of ['trip', 'continuation', 'queries'] as const) {
        expect(a[key].value).toEqual(b[key].value);
        const differences = corpusDifferences(work(a[key]), work(b[key]));
        workComparisons.push({ step: a.step, phase: key, equal: differences.length === 0, differences });
        // Movement byte equality is separately FALSE on this source; never erase its raw differing counters.
        // This cohort asserts the requested wire/evidence boundary, not completion of Sprint 4.
        if (key !== 'trip') expect(differences).toEqual([]);
      }
    }
    const a = journeys[0].at(-1)!, b = journeys[1].at(-1)!;
    expect(a.input).toEqual(b.input); expect(a.trip.value.selected).toEqual(b.trip.value.selected);
    expect(a.sight!.cells).not.toEqual(b.sight!.cells);
    await attach(info, 'comparison-summary.json', { equalCheckpoints: zero ? [0, 6] : [6], firstLawfulSightDifference: 7, workComparisons,
      step7: { admissionEqual: JSON.stringify(a.trip.value.admission) === JSON.stringify(b.trip.value.admission),
        progressEqual: JSON.stringify(a.trip.value.events) === JSON.stringify(b.trip.value.events),
        historyEqual: JSON.stringify(a.queries.value.history) === JSON.stringify(b.queries.value.history) },
      maxObservationBytes: Math.max(...journeys.flat().map(s => bytes(s.queries.value.history.result.observation))),
      maxResultBytes: Math.max(...journeys.flat().map(s => bytes(s.queries.value.history.result))) });
    for (const [file, hash] of Object.entries(hashes)) expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(hash);
  } finally {
    for (const [i, fixture] of fixtures.entries()) {
      await attach(info, `browser-${i}.json`, { external: fixture.external, errors: fixture.errors,
        failure: await fixture.page.evaluate(() => ({ failure: window.navigationFailure ?? null,
          predecessor: window.navigationPredecessor ?? null })).catch(() => null) });
      await fixture.page.evaluate(() => window.corpusNavigation?.stop()).catch(() => {});
      await fixture.context.close(); expect(fixture.external).toEqual([]); expect(fixture.errors).toEqual([]);
    }
  }
});

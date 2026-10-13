import { test, expect } from '@playwright/test';
import type {} from './canonical-auto.fixture';
import type { AutoSeed } from './canonical-auto.seed';

const seeds: AutoSeed[] = [
  { seed: 2, rooms: 8, minSide: 5, maxSide: 15, joins: 'mixed' },
  { seed: 7, rooms: 8, minSide: 15, maxSide: 15, joins: 'direct' },
  { seed: 19, rooms: 12, minSide: 11, maxSide: 15, joins: 'mixed' },
  { seed: 42, rooms: 8, minSide: 15, maxSide: 15, joins: 'passage' },
];
for (const seed of seeds) test(`seed ${seed.seed}: all reachable noncombat work before combat-required (${seed.minSide}-${seed.maxSide}, ${seed.joins})`, async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
  const result = await page.evaluate(async seed => {
    const a = window.canonicalAuto; await a.seedAuto(seed);
    const before = (await a.readCanonical((p, s) => a.readKnowledgeRoom(p, a.roster.gameCheckpoint(s.checkpoint)))).value;
    let ticks = 0, moves = 0, stairs = 0, outcome = 'budget';
    for (; ticks < 2000; ticks++) {
      const result = (await a.act()).outcome.receipt.result;
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Invalid tick result');
      if (result.action && typeof result.action === 'object' && !Array.isArray(result.action)) {
        moves += Number(result.action.kind === 'move'); stairs += Number(result.action.kind === 'stairs');
      }
      if (result.outcome === 'blocked') { outcome = String(result.reason); ticks++; break; }
    }
    const after = (await a.readCanonical((p, s) => a.readKnowledgeRoom(p, a.roster.gameCheckpoint(s.checkpoint)))).value;
    return { ticks, moves, stairs, outcome, state: (await a.read()).value, audit: await a.auditAutoCompletion(),
      before: { cells: before.cells.length, frontiers: before.frontiers.length }, after: { cells: after.cells.length, frontiers: after.frontiers.length } };
  }, seed);
  console.info('AUTO_SEED', JSON.stringify({ seed, ticks: result.ticks, moves: result.moves, outcome: result.outcome,
    before: result.before, after: result.after, remaining: result.audit.rooms.filter(r => r.chest && !r.chest.opened
      || r.contract && r.contract.objective !== 'kill' && r.contract.status !== 'claimed') }));
  expect(result.outcome).toContain('combat-required'); expect(result.stairs).toBe(0);
  expect(result.state.checkpoint.mode).toBe('manual'); expect(result.audit.reachable).toBe(seed.rooms);
  const chests = result.audit.rooms.flatMap(r => r.chest ? [r.chest] : []);
  expect(chests.length).toBeGreaterThan(0); expect(chests.filter(c => !c.opened)).toEqual([]);
  const contracts = result.audit.rooms.flatMap(r => r.contract ? [r.contract] : []), nonkill = contracts.filter(c => c.objective !== 'kill');
  expect(nonkill.length).toBeGreaterThan(0);
  expect(nonkill.filter(c => !c.accepted || c.status !== 'claimed' || c.progress < c.required)).toEqual([]);
  const kill = contracts.filter(c => c.objective === 'kill'); expect(kill.length).toBeGreaterThan(0);
  expect(kill.every(c => !c.accepted && c.status === null && c.progress === 0)).toBe(true);
  expect(result.after.frontiers).toBe(0);
  if (seed.minSide === 15) {
    expect(result.before.frontiers).toBeGreaterThan(0);
    expect(result.after.cells).toBeGreaterThan(result.before.cells);
  }
});

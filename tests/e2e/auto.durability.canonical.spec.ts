import { test, expect } from '@playwright/test';
import type {} from './canonical-auto.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
});

test('reload retains objective and route; exact attempt replay applies no second effect', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const a = window.canonicalAuto; await a.seed();
    for (let n = 0; n < 64; n++) {
      const tick = await a.act(), saved = await a.read();
      if (saved.value.state?.route && saved.value.state.objective) return { tick, saved };
    }
    throw Error('No cached route within qualification budget');
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAuto);
  const after = await page.evaluate(async request => {
    const a = window.canonicalAuto, saved = await a.read(), replay = await a.replay(request), unchanged = await a.read();
    const next = await a.act(), continued = await a.read(); return { saved, replay, unchanged, next, continued };
  }, JSON.stringify(before.tick.request));
  expect(after.saved).toEqual(before.saved);
  expect(after.replay.outcome.receipt).toEqual(before.tick.outcome.receipt);
  expect(after.unchanged).toEqual(before.saved);
  expect(after.continued.value.checkpoint.position).toEqual(before.saved.value.state!.route!.steps[0].to);
  expect(after.continued.value.state!.objective).toEqual(before.saved.value.state!.objective);
});

test('inactive and stale ticks cannot affect world; callback failure rolls all Auto work back', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = window.canonicalAuto; await a.seed();
    const initial = await a.readCanonicalHead();
    const stale = await a.act(a.worldRequest(initial.head, 'auto.command', { kind: 'tick', revision: initial.head.revision - 1 }));
    const staleHead = await a.readCanonicalHead();
    const request = a.worldRequest(staleHead.head, 'auto.command', { kind: 'tick', revision: staleHead.head.revision });
    let error = '';
    try { await a.executeCanonical(request, async tx => { await a.commitAutoCommand(tx, request.input, request.attemptId); throw Error('injected rollback'); }); }
    catch (e) { error = String(e); }
    const rollback = await a.readCanonicalHead(), state = await a.read();
    await a.enabled(false); const disabled = await a.readCanonicalHead(), paused = await a.act(), after = await a.readCanonicalHead();
    let guildError = '';
    try { await a.readCanonical((p, s) => a.readAutoGuild(p, a.roster.gameCheckpoint(s.checkpoint))); } catch (e) { guildError = String(e); }
    return { initial, stale, staleHead, rollback, state, disabled, paused, after, error, guildError };
  });
  expect(result.stale.outcome.receipt.result).toMatchObject({ outcome: 'stale' });
  expect(result.staleHead.head.roots.world).toEqual(result.initial.head.roots.world);
  expect(result.staleHead.head.roots.knowledge).toEqual(result.initial.head.roots.knowledge);
  expect(result.rollback).toEqual(result.staleHead); expect(result.state.value.state).toBeNull();
  expect(result.error).toContain('injected rollback');
  expect(result.paused.outcome.receipt.result).toMatchObject({ outcome: 'paused' });
  expect(result.after.head.roots.world).toEqual(result.disabled.head.roots.world);
  expect(result.after.head.roots.knowledge).toEqual(result.disabled.head.roots.knowledge);
  expect(result.guildError).toContain('requires enabled Auto');
});

test('cached step stays scoped with sixteen retained floors', async ({ browser }) => {
  const results = [];
  for (const depth of [1, 16]) {
    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:5221/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
    try { results.push(await page.evaluate(async depth => {
    const a = window.canonicalAuto; await a.seed();
    for (let level = 2; level <= depth; level++) await a.nextFloor(level);
    for (let n = 0; n < 64; n++) { await a.act(); if ((await a.read()).value.state?.route) break; }
    const before = (await a.read()).value.state;
    if (!before?.route) throw Error('Missing cached route');
    const reads: string[] = [], writes: string[] = [], proto = a.CanonicalPages.prototype, get = proto.get, scan = proto.scan, set = proto.set;
    proto.get = function(area, key) { reads.push(`${area}:${key}`); return get.call(this, area, key); };
    proto.scan = function(area, key, after, limit) { reads.push(`${area}:${key}`); return scan.call(this, area, key, after, limit); };
    proto.set = function(area, key, value, indexes) { writes.push(`${area}:${key}`); return set.call(this, area, key, value, indexes); };
    try { const tick = await a.act(); return { depth, stats: tick.outcome.stats, result: tick.outcome.receipt.result, reads, writes }; }
    finally { proto.get = get; proto.scan = scan; proto.set = set; }
    }, depth)); } finally { await page.close(); }
  }
  for (const r of results) {
    expect(r.result).toMatchObject({ outcome: 'applied', action: { kind: 'move' } });
    expect([...r.reads, ...r.writes].filter(key => /(?:dungeon|content|auto\/room)\/(?:[2-9]|1[0-6])\//.test(key))).toEqual([]);
    expect(r.stats.reads).toBeLessThan(1000); expect(r.stats.writeBytes).toBeLessThan(250000);
  }
  expect(results[1].stats.reads).toBeLessThan(results[0].stats.reads * 2);
  console.info('CANONICAL_AUTO_DEPTH', JSON.stringify(results.map(({ depth, stats }) => ({ depth, stats }))));
});

import { test, expect } from '@playwright/test';
import type {} from './canonical-quality-fixture';
import './canonical-quality.failures';
import './canonical-quality.integrity';

const origin = 'http://127.0.0.1:5212';
test.beforeEach(async ({ page, context, baseURL }) => {
  test.skip(baseURL !== origin, 'Independent quality fixture requires port 5212');
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-quality-fixture.html');
  await page.waitForFunction(() => !!window.canonicalQuality); await context.setOffline(true);
});

for (const joins of ['direct', 'mixed', 'passage'] as const) test(`offline ${joins} qualification matches full D1`, async ({ page }) => {
  const result = await page.evaluate(async joins => {
    const c = window.canonicalQuality, floor = await c.seedWorld(781, 25, joins);
    const begun = await c.begin(), batches = [];
    for (let i = 0; i < 7; i++) batches.push(await c.advance());
    const required = await c.readCanonical(pages => c.quality.requireWorldFloorQuality(pages, 1));
    return { floor, begun: begun.receipt.result, batches, required: required.value, parity: await c.parity() };
  }, joins);
  expect(result.parity.state.metrics).toEqual(result.parity.expected);
  expect(result.parity.state.status).toBe(result.parity.passed ? 'qualified' : 'failed');
  expect(result.required).toEqual(result.parity.state);
  expect(result.parity.floor).toEqual(result.floor);
  expect(result.begun).toMatchObject({ status: 'running', metrics: null, nextRoom: 24 });
  for (const batch of result.batches) {
    expect(batch.keys.length).toBeLessThanOrEqual(160); expect(batch.writes.length).toBeLessThanOrEqual(5);
    expect(batch.writes.every(key => key.startsWith('dungeon/1/quality/'))).toBe(true);
    expect(batch.stats.reads).toBeLessThanOrEqual(2048); expect(batch.stats.writes).toBeLessThanOrEqual(512);
    expect(batch.stats.readBytes + batch.stats.writeBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  }
});

test('reload resumes original begin/advance receipt without recompilation, even after takeover', async ({ page, context }) => {
  const before = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld();
    const start = await c.request('fixture.quality.begin', { level: 1 }), begun = await c.begin(start);
    const original = await c.request('fixture.quality.advance', { level: 1, maxRooms: 3 }), applied = await c.advance(original, 3);
    return { start, begun: begun.receipt, original, receipt: applied.receipt, snapshot: await c.snapshot() };
  });
  await context.setOffline(false); await page.reload(); await page.waitForFunction(() => !!window.canonicalQuality);
  await context.setOffline(true);
  const after = await page.evaluate(async serialized => {
    const saved = JSON.parse(serialized) as { start: import('../../src/persistence/canonical/types').CanonicalRequest;
      original: import('../../src/persistence/canonical/types').CanonicalRequest };
    const c = window.canonicalQuality, fail = async () => { throw Error('Original attempt must replay, not requalify'); };
    const begin = await c.executeCanonical(saved.start, fail), replay = await c.executeCanonical(saved.original, fail);
    const unchanged = await c.snapshot();
    await c.controlCanonical(await c.request('control.takeover', { owner: 'next-owner' }), 'takeover');
    const takeover = await c.executeCanonical(saved.original, fail);
    await c.controlCanonical(await c.request('control.resume', { owner: 'next-owner' }), 'resume');
    await c.finishQuality(); return { begin, replay, unchanged, takeover, parity: await c.parity() };
  }, JSON.stringify(before));
  expect(after.begin.receipt).toEqual(before.begun); expect(after.replay.receipt).toEqual(before.receipt);
  expect(after.begin.replayed && after.replay.replayed && after.takeover.replayed).toBe(true);
  expect(after.takeover.receipt).toEqual(before.receipt); expect(after.unchanged).toEqual(before.snapshot);
  expect(after.parity.state.metrics).toEqual(after.parity.expected);
});

for (const count of [8, 65]) test(`fixed batch bound at ${count} rooms with addressable scratch only`, async ({ page }, info) => {
  const measured = await page.evaluate(async count => {
    const c = window.canonicalQuality; await c.seedWorld(781, count, 'passage'); await c.begin();
    const batches = [];
    for (let i = 0; i < Math.ceil(count / 4); i++) batches.push(await c.advance());
    return { count, batches: batches.map(batch => ({ reads: batch.keys.length, writes: batch.writes.length, stats: batch.stats })), parity: await c.parity() };
  }, count);
  await info.attach('quality-batch-costs', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' });
  expect(measured.parity.state.metrics).toEqual(measured.parity.expected);
  expect(measured.parity.state.status).toBe(measured.parity.passed ? 'qualified' : 'failed');
  expect(Math.max(...measured.batches.map(batch => batch.reads))).toBeLessThanOrEqual(160);
  expect(Math.max(...measured.batches.map(batch => batch.writes))).toBeLessThanOrEqual(5);
});

test('complete connected chain fails full D1 quality durably and cannot restart', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedChain(); await c.finishQuality();
    const before = await c.snapshot(), parity = await c.parity(true);
    const begin = await c.begin().catch(String), advance = await c.advance().catch(String);
    const admission = await c.readCanonical(pages => c.quality.requireWorldFloorQuality(pages, 1)).catch(String);
    return { before, after: await c.snapshot(), parity, begin, advance, admission };
  });
  expect(result.parity.state.metrics).toEqual(result.parity.expected); expect(result.parity.passed).toBe(false);
  expect(result.parity.state).toMatchObject({ status: 'failed', metrics: { rooms: 13, reachable: 13, joins: 12, forks: 0, longestChain: 12 } });
  expect(result.begin).toContain('failed structural'); expect(result.advance).toContain('failed structural');
  expect(result.admission).toContain('not structurally qualified'); expect(result.after).toEqual(result.before);
});

test('prepared roles do not admit content before structural qualification', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(781, 8);
    await c.executeCanonical(await c.request('fixture.roles'), async ({ pages }) => {
      await c.roles.beginWorldRoomRoles(pages, 1); return c.json(await c.roles.advanceWorldRoomRoles(pages, 1));
    });
    const requireQuality = () => c.readCanonical(pages => c.quality.requireWorldFloorQuality(pages, 1)).catch(String);
    const absent = await requireQuality(); await c.begin(); const running = await requireQuality();
    await c.finishQuality(); return { absent, running, ready: await requireQuality() };
  });
  expect(result.absent).toContain('quality has not begun'); expect(result.running).toContain('not structurally qualified');
  expect(result.ready).toMatchObject({ value: { status: 'qualified' } });
});

import { test, expect } from '@playwright/test';
import type {} from './canonical-game-map-fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5220' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-game-map-fixture.html');
  await page.waitForFunction(() => !!window.canonicalMap);
});

test('native hidden changes leave earned regions and pixels unchanged; old snapshots and receipts remain exact', async ({ page }, info) => {
  await page.evaluate(() => window.canonicalMap.seedNegative());
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const c = window.canonicalMap, targets = await c.content.targets();
    const target = targets.find(t => t.chest)!;
    const at = { level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } };
    await c.content.place(at); await c.knowledge.act({ kind: 'look' });
    const old = await c.show(), actor = old.actor!, scope = { floor: 1, row: actor.row - 4, column: actor.column - 4, rows: 9, columns: 9 };
    const receipt = old.observation;
    await c.content.place({ level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } }); await c.knowledge.act({ kind: 'look' });
    const beforeSnapshot = (await c.readCanonicalHead()).snapshot, before = await c.picture(beforeSnapshot, scope);
    const loot = (await c.roster.read()).value.state.inventory.items.slice(0, 2);
    await c.content.work(async tx => {
      const chest = await c.content.records.loadChest(tx.pages, 1, target.room.chestId!);
      await c.content.records.saveChest(tx.pages, { ...chest, chest: { ...chest.chest, opened: true, loot } }); return {};
    });
    const afterSnapshot = (await c.readCanonicalHead()).snapshot, after = await c.picture(afterSnapshot, scope);
    const guarded = await c.readCanonical(async (p, s) => c.readKnowledgeRegion({
      get: (area, key) => { if (area !== 'knowledge') throw Error('Hidden geometry read'); return p.get(area, key); },
      witness: (area, prefix) => { if (area !== 'knowledge') throw Error('Hidden namespace'); return p.witness(area, prefix); },
      scan: async () => { throw Error('Unbounded scan'); },
    }, c.gameCheckpoint(s.checkpoint), scope), { snapshot: afterSnapshot });
    await c.content.place(at); await c.knowledge.act({ kind: 'look' });
    const current = await c.show(), changed = await c.picture(current.snapshot, scope), retained = await c.picture(old.snapshot, scope);
    const oldObservation = (await c.readCanonical(p => c.knowledge.loadObservation(p,
      { sequence: receipt!.header.sequence, id: c.gameCheckpoint(old.snapshot.checkpoint).knowledge!.id }), { snapshot: old.snapshot })).value;
    return { equalRegion: JSON.stringify(before.region) === JSON.stringify(after.region), equalPixels: before.pixels === after.pixels,
      guarded: JSON.stringify(guarded.value) === JSON.stringify(after.region), stats: after.stats,
      changed: changed.region.cells.find(c => c.cell.at.cell.spaceId === at.cell.spaceId && c.cell.at.cell.row === at.cell.row && c.cell.at.cell.column === at.cell.column)?.cell.chests,
      retained: retained.region.cells.find(c => c.cell.at.cell.spaceId === at.cell.spaceId && c.cell.at.cell.row === at.cell.row && c.cell.at.cell.column === at.cell.column)?.cell.chests,
      oldReceiptEqual: JSON.stringify(oldObservation) === JSON.stringify(receipt) };
  });
  expect(result.equalRegion).toBe(true); expect(result.equalPixels).toBe(true); expect(result.guarded).toBe(true);
  expect(result.changed).toMatchObject([{ opened: true }]); expect(result.retained).toMatchObject([{ opened: false }]); expect(result.oldReceiptEqual).toBe(true);
  expect(result.stats.writes).toBe(0); expect(result.stats.reads).toBeLessThan(16384); expect(result.stats.readBytes).toBeLessThan(16 * 1024 * 1024);
  await info.attach('earned-evidence', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('native unchanged sightings preserve index identity; region limits and mixed snapshot roots fail closed', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalMap, before = await c.seedNegative(), at = before.observation!.header.actor, world = before.actor!;
    const key = c.worldBlockKey(at.level, world), memory = c.knowledge.blockKey(at);
    const original = (await c.readCanonical(async p => [await p.get('knowledge', key), await p.get('knowledge', memory)], { snapshot: before.snapshot })).value;
    await c.knowledge.act({ kind: 'look' });
    const after = (await c.readCanonicalHead()).snapshot;
    const renewed = (await c.readCanonical(async p => [await p.get('knowledge', key), await p.get('knowledge', memory)], { snapshot: after })).value;
    const scope = { floor: 1, row: world.row - 4, column: world.column - 4, rows: 9, columns: 9 }, errors: string[] = [];
    try { await c.readCanonicalRegion({ ...after, checkpoint: before.snapshot.checkpoint }, scope); } catch (e) { errors.push(String(e)); }
    try { await c.readCanonicalRegion(after, { ...scope, rows: 33, columns: 32 }); } catch (e) { errors.push(String(e)); }
    try {
      await c.readCanonical((p, s) => c.readKnowledgeRegion(p, c.gameCheckpoint(s.checkpoint), scope),
        { snapshot: after, limits: { reads: 2, writes: 1, bytes: 65536 } });
    } catch (e) { errors.push(String(e)); }
    const empty = await c.readCanonicalRegion(after, { floor: 1, row: -1001, column: -1001, rows: 64, columns: 16 });
    return { unchanged: JSON.stringify(original) === JSON.stringify(renewed), errors, emptyCount: empty.value.cells.length, emptyStats: empty.stats };
  });
  expect(result.unchanged).toBe(true); expect(result.errors).toHaveLength(3);
  expect(result.errors[0]).toContain('knowledge namespace'); expect(result.errors[1]).toContain('area <= 1024'); expect(result.errors[2]).toContain('budget exhausted');
  expect(result.emptyCount).toBe(0); expect(result.emptyStats.writes).toBe(0);
  await info.attach('bounded-query-evidence', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('negative world clicks, signed panning, overview and desktop/mobile resize retain a bounded nonblank canvas', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const initial = await page.evaluate(() => window.canonicalMap.seedNegative());
  expect(initial.actor!.row < 0 || initial.actor!.column < 0).toBe(true);
  const canvas = page.locator('canvas'); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  await page.waitForLoadState('networkidle');
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width === Math.floor(c.getBoundingClientRect().width * devicePixelRatio)
      && c.height === Math.floor(c.getBoundingClientRect().height * devicePixelRatio))).toBe(true);
    await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
    const point = await page.evaluate(() => window.canonicalMap.clickPoint());
    const clickCount = await page.evaluate(() => window.canonicalMap.clicks.length);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.evaluate(() => window.canonicalMap.clicks.length)).toBe(clickCount + 1);
    expect(await page.evaluate(() => window.canonicalMap.clicks.at(-1))).toEqual(point.world);
    const pixels = await canvas.evaluate((c: HTMLCanvasElement) => {
      const values = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, colors = new Set<number>();
      for (let i = 0; i < values.length; i += 4) colors.add(values[i] << 16 | values[i + 1] << 8 | values[i + 2]);
      return { colors: colors.size, area: Number(c.dataset.rows) * Number(c.dataset.columns), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(pixels.colors).toBeGreaterThan(20); expect(pixels.area).toBeLessThanOrEqual(1024); expect(pixels.overflow).toBe(false);
    await page.screenshot({ path: info.outputPath(`map-${size.width}x${size.height}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('tab', { name: 'Nearby', exact: true }).click(); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const overviewCount = await page.evaluate(() => window.canonicalMap.clicks.length);
  const overviewPoint = await page.evaluate(() => window.canonicalMap.clickPoint()); await page.mouse.click(overviewPoint.x, overviewPoint.y);
  await expect.poll(() => page.evaluate(() => window.canonicalMap.clicks.length)).toBe(overviewCount + 1);
  expect(await page.evaluate(() => window.canonicalMap.clicks.at(-1))).toEqual(overviewPoint.world);
  await page.getByRole('button', { name: 'Map', exact: true }).click(); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const before = await canvas.evaluate(c => ({ row: Number(c.dataset.rowStart), column: Number(c.dataset.columnStart) }));
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 200, bounds.y + bounds.height / 2 + 100, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.rowStart))).toBeLessThan(before.row);
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.columnStart))).toBeLessThan(before.column);
  await page.getByRole('button', { name: 'Recenter camera' }).click(); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const point = await page.evaluate(() => window.canonicalMap.clickPoint()), count = await page.evaluate(() => window.canonicalMap.clicks.length);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.evaluate(async () => { await window.canonicalMap.knowledge.act({ kind: 'look' }); await window.canonicalMap.show(); });
  await expect(canvas).not.toHaveAttribute('aria-busy', 'true'); await page.mouse.up();
  expect(await page.evaluate(() => window.canonicalMap.clicks.length)).toBe(count);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

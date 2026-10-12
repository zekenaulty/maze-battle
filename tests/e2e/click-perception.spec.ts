import { test, expect, type Page } from '@playwright/test';
import config from './click-navigation.config';
import type {} from './click-navigation-fixture';

// Stabilize Chromium readback backend for pixel-exact counterfactual comparisons.
test.use({ launchOptions: { ...config.use?.launchOptions, args: ['--disable-accelerated-2d-canvas'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5203'
    ? route.continue() : route.abort());
  await page.goto('/tests/e2e/click-navigation-fixture.html');
  await page.evaluate(() => { Date.now = () => 1791836926000; });
  await settled(page);
});

async function settled(page: Page) {
  await expect.poll(() => page.evaluate(async () => (await window.clickRpg.snapshot()).saves.find(s => s.slotId === 'auto')?.observationHead)).toBeTruthy();
  const head = await page.evaluate(async () => (await window.clickRpg.snapshot()).saves.find(s => s.slotId === 'auto')?.observationHead);
  const canvas = page.getByLabel('Dungeon map');
  await expect(canvas).toHaveAttribute('data-frame', new RegExp(`^${head}:`));
  await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The sprite module schedules a draw when its real bitmap finishes loading.
  await page.waitForTimeout(250);
}
async function pixels(page: Page) {
  return page.getByLabel('Dungeon map').evaluate(async (canvas: HTMLCanvasElement) => {
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''),
      width: canvas.width, height: canvas.height, scope: { ...canvas.dataset },
      nonblank: bytes.some((value, index) => index % 4 !== 3 && value > 50) };
  });
}
async function stoneCell(page: Page) {
  return page.getByLabel('Dungeon map').evaluate(async (canvas: HTMLCanvasElement) => {
    const { rows, columns, rowStart, columnStart } = canvas.dataset;
    const width = Math.floor(canvas.getBoundingClientRect().width), height = Math.floor(canvas.getBoundingClientRect().height);
    const cell = Math.floor(Math.min((width - 16) / Number(columns), (height - 16) / Number(rows)));
    const x = Math.floor((width - cell * Number(columns)) / 2) + (5 - Number(columnStart)) * cell;
    const y = Math.floor((height - cell * Number(rows)) / 2) + (3 - Number(rowStart)) * cell;
    // Desktop DPR 1: compare the same world stone cell under a translated scope.
    const bytes = canvas.getContext('2d')!.getImageData(x, y, cell, cell).data;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))];
  });
}
async function change(page: Page, action: 'narrow' | 'unseen' | 'save' | 'load') {
  await page.evaluate(async action => { await window.clickRpg.perception.perceptionChange(action); window.dispatchEvent(new Event('focus')); }, action);
  await settled(page);
}
async function chest(page: Page) {
  return page.evaluate(async () => {
    const result = await window.clickRpg.perception.readRpgPerceptionRegion('auto', { floor: 1, row: 3, column: 5, rows: 1, columns: 1 });
    if (result.status !== 'ready') throw new Error('Map unprepared');
    return result.data.cells[0];
  });
}
async function step(page: Page, column: number) {
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(async () => (await window.clickRpg.snapshot()).saves.find(s => s.slotId === 'auto')!.game.maze.active.column)).toBe(column);
  await settled(page);
}

test('real App pixels ignore hidden world extent, chest and wall changes; fresh sight updates and old save restores memory', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await change(page, 'narrow'); await change(page, 'save');
  expect(await chest(page)).toMatchObject({ state: 'remembered', fact: { chests: [{ opened: false }] } });
  const before = await pixels(page); expect(before.nonblank).toBe(true);
  await change(page, 'unseen');
  // This also allows the ordinary App refresh timer to consume the hidden revision.
  await page.waitForTimeout(850);
  expect(await pixels(page)).toEqual(before);
  expect(await chest(page)).toMatchObject({ state: 'remembered', fact: { chests: [{ opened: false }] } });
  const hiddenState = await page.evaluate(async () => (await window.clickRpg.snapshot()).saves.find(s => s.slotId === 'auto')!.game);
  expect(hiddenState.chests[0].opened).toBe(true); expect(hiddenState.maze.columns).toBe(31);
  await page.screenshot({ path: info.outputPath('remembered-unseen-change.png') });
  await step(page, 3); await step(page, 4);
  expect(await chest(page)).toMatchObject({ state: 'visible', fact: { chests: [{ opened: true }], edges: { east: { state: 'blocked' } } } });
  expect((await pixels(page)).hash).not.toBe(before.hash);
  await page.screenshot({ path: info.outputPath('fresh-sight.png') });
  await change(page, 'load');
  expect(await pixels(page)).toEqual(before);
  await page.reload(); await page.evaluate(() => { Date.now = () => 1791836926000; }); await settled(page);
  expect(await pixels(page)).toEqual(before);
  expect(await chest(page)).toMatchObject({ state: 'remembered', fact: { chests: [{ opened: false }] } });
  expect(errors).toEqual([]);
  await info.attach('pixel-evidence', { contentType: 'application/json', body: JSON.stringify({ before, restored: await pixels(page), browser: info.project.name }) });
});

test('camera resize and pan return to the same bounded pixels without changing evidence or game state', async ({ page }, info) => {
  await change(page, 'narrow');
  const before = await pixels(page), state = await page.evaluate(() => window.clickRpg.snapshot());
  const stone = info.project.name === 'desktop' ? await stoneCell(page) : undefined;
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width + 93, height: original.height + 53 }); await settled(page);
  await page.setViewportSize(original); await settled(page);
  expect(await pixels(page)).toEqual(before);
  const bounds = (await page.getByLabel('Dungeon map').boundingBox())!;
  const x = bounds.x + bounds.width * .6, y = bounds.y + bounds.height * .5;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 120, y - 75, { steps: 8 }); await page.mouse.up(); await settled(page);
  const panned = await pixels(page);
  expect(panned.scope.columnStart).not.toEqual(before.scope.columnStart);
  if (stone) expect(await stoneCell(page)).toEqual(stone);
  await page.getByRole('button', { name: 'Recenter camera' }).click(); await settled(page);
  expect(await pixels(page)).toEqual(before);
  expect(await page.evaluate(() => window.clickRpg.snapshot())).toEqual(state);
  await page.screenshot({ path: info.outputPath('recentered-map.png') });
});

import { test as base, expect, type Page } from '@playwright/test';
import { cameraCellSize } from '../../src/components/maze/mazeCamera';
import type {} from './click-navigation-fixture';

const test = base.extend<{ audit: void }>({
  audit: [async ({ context, page }, use, info) => {
    const errors: string[] = [], outbound: string[] = [];
    context.on('page', tab => tab.on('pageerror', e => errors.push(e.message)));
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5203') return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await use();
    await info.attach('audit', { contentType: 'application/json', body: JSON.stringify({ errors, outbound, browser: context.browser()!.version(), viewport: page.viewportSize(), dpr: await page.evaluate(() => devicePixelRatio) }) });
    expect(errors).toEqual([]); expect(outbound).toEqual([]);
  }, { auto: true }],
});
const snapshot = (page: Page) => page.evaluate(() => window.clickRpg.snapshot());
const state = async (page: Page) => (await snapshot(page)).saves.find(s => s.slotId === 'auto')!.game;
async function open(page: Page) {
  await page.goto('/tests/e2e/click-navigation-fixture.html');
  await expect(page.locator('.screen-status')).toContainText('Ready');
  await expect(page.getByLabel('Dungeon map')).not.toHaveAttribute('aria-busy', 'true');
}
async function at(page: Page, column: number) {
  await expect.poll(async () => (await state(page)).maze.active.column, { intervals: [25, 50] }).toBe(column);
}
async function point(page: Page, column: number, _zoom = 1, overview = false) {
  const canvas = page.getByLabel('Dungeon map');
  await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const bounds = (await canvas.boundingBox())!;
  const viewport = await canvas.evaluate(c => ({ rows: Number(c.dataset.rows), columns: Number(c.dataset.columns),
    rowStart: Number(c.dataset.rowStart), columnStart: Number(c.dataset.columnStart) }));
  const size = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
  const cell = overview ? Math.min((size.width - 16) / viewport.columns, (size.height - 16) / viewport.rows) : cameraCellSize(size, viewport);
  const x = Math.floor((size.width - cell * viewport.columns) / 2) + (column - viewport.columnStart + .5) * cell;
  const y = Math.floor((size.height - cell * viewport.rows) / 2) + (3 - viewport.rowStart + .5) * cell;
  return { x: bounds.x + x * bounds.width / size.width, y: bounds.y + y * bounds.height / size.height };
}
async function clickTile(page: Page, column: number, zoom = 1, overview = false) {
  const p = await point(page, column, zoom, overview);
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function stable(page: Page, column: number) {
  await page.waitForTimeout(650);
  expect((await state(page)).maze.active.column).toBe(column);
}

test('Agentic exploration selection fits desktop/mobile and does not move or launch on selection', async ({ page }, info) => {
  await open(page); const before = await state(page);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await page.getByRole('radio', { name: 'Explore', exact: true }).check();
  await expect(page.getByLabel('Row (1-based)')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  const dialog = page.getByRole('dialog', { name: 'Agentic play' });
  const bounds = (await dialog.boundingBox())!, viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: info.outputPath('exploration-dialog.png') });
  expect(await state(page)).toEqual(before);
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

test('real keyboard/D-pad movement is loot-free; E/button opens once and persists', async ({ page }, info) => {
  await open(page);
  const before = await state(page);
  for (const column of [3, 4, 5]) {
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Move east', exact: true }).tap();
    else await page.keyboard.press(column === 3 ? 'd' : 'ArrowRight');
    await at(page, column);
  }
  const arrived = await state(page);
  expect(arrived.chests).toEqual(before.chests); expect(arrived.inventory).toEqual(before.inventory);
  await expect(page.getByRole('button', { name: 'Open chest', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('arrived-chest-closed.png') });
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open chest', exact: true }).tap();
  else await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).chests[0].opened).toBe(true);
  const opened = await state(page);
  expect(opened.chests[0].loot!.length).toBeGreaterThan(0);
  await page.keyboard.press('e'); await page.keyboard.press('e');
  await page.reload(); await expect(page.locator('.screen-status')).toContainText('Ready');
  expect((await state(page)).chests).toEqual(opened.chests);
  expect((await state(page)).inventory).toEqual(opened.inventory);
  await expect(page.getByRole('button', { name: 'Open chest', exact: true })).toBeDisabled();
  await info.attach('persisted-effect', { contentType: 'application/json', body: JSON.stringify(await snapshot(page)) });
});

test('click/tap coordinates survive DPR, resize, zoom and overview; arrival does not loot', async ({ page }, info) => {
  await open(page);
  const initial = await state(page);
  await clickTile(page, 5); await at(page, 5); await stable(page, 5);
  expect((await state(page)).chests).toEqual(initial.chests);
  expect((await state(page)).inventory).toEqual(initial.inventory);
  await page.screenshot({ path: info.outputPath('click-arrival.png') });
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 460, height: 850 } : { width: 1043, height: 763 });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await clickTile(page, 4, 1.15); await at(page, 4);
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const beforeUnknown = await snapshot(page);
  await clickTile(page, 14, 1, true); await stable(page, 4);
  expect((await snapshot(page)).meta).toEqual(beforeUnknown.meta); // no canonical dispatch for hidden targets
  await clickTile(page, 6, 1, true); await at(page, 6); await stable(page, 6);
  expect((await state(page)).chests[0].opened).toBe(false);
  await page.screenshot({ path: info.outputPath('resized-overview.png') });
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Recenter camera' }).click();
  // Real canvas backing pixels are scaled by DPR; hits remain in CSS pixels.
  expect(await page.getByLabel('Dungeon map').evaluate((c: HTMLCanvasElement) => c.width === Math.floor(Math.floor(c.getBoundingClientRect().width) * devicePixelRatio))).toBe(true);
});

test('drag, keyboard/D-pad takeover and modal opening cancel routes', async ({ page }, info) => {
  await open(page);
  const start = await point(page, 4);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y, { steps: 6 }); await page.mouse.move(start.x, start.y); await page.mouse.up();
  await stable(page, 2);
  await page.getByRole('button', { name: 'Recenter camera' }).click();
  await clickTile(page, 8); await at(page, 3);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Move west', exact: true }).tap();
  else await page.keyboard.press('ArrowLeft');
  const stopped = (await state(page)).maze.active.column;
  await stable(page, stopped);
  await clickTile(page, 8);
  await page.keyboard.press('i');
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused = (await state(page)).maze.active.column;
  const target = await point(page, 8);
  await page.mouse.click(target.x, target.y); // native dialog backdrop, never the canvas
  await page.keyboard.press('e'); await page.keyboard.press('ArrowRight');
  await stable(page, paused);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await stable(page, paused);
  await clickTile(page, 8); await page.keyboard.press('Escape');
  const escaped = (await state(page)).maze.active.column; await stable(page, escaped);
});

test('Auto deliberately collects; portal hotkey and tab custody stop manual click travel', async ({ page, context }) => {
  await open(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await state(page)).chests[0].opened).toBe(true);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await clickTile(page, 8); await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  const inTown = (await state(page)).maze.active.column; await stable(page, inTown);
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await expect(page.getByLabel('Dungeon map')).toBeVisible();
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByRole('button', { name: 'Take control' })).toBeVisible();
  await clickTile(page, 8);
  await other.getByRole('button', { name: 'Take control' }).click();
  await expect(page.getByRole('button', { name: 'Take control' })).toBeVisible();
  const fenced = (await state(page)).maze.active.column; await stable(page, fenced);
  await other.close();
});

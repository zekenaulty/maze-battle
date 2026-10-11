import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import type { Direction, GameState, GridPosition, MazeState } from '../../src/domain/types';
import { findPath } from '../../src/domain/maze/solver';
import { movePosition } from '../../src/domain/maze/movement';
import { samePosition } from '../../src/domain/maze/key';
import type {} from './d1-rpg-fixture';

export { expect };
export const test = base.extend<{ audit: void }>({
  audit: [async ({ page, context }, use, info) => {
    const errors: string[] = [], external: string[] = [], failedAssets: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedAssets.push(response.url()); });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5199') return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await use();
    await info.attach('environment', { contentType: 'application/json', body: JSON.stringify({
      base: '5c12b49', browser: context.browser()!.version(), project: info.project.name,
      viewport: page.viewportSize(), errors, external, failedAssets,
    }, null, 2) });
    expect(errors).toEqual([]); expect(external).toEqual([]); expect(failedAssets).toEqual([]);
  }, { auto: true }],
});

export const snapshot = (page: Page) => page.evaluate(() => window.d1Rpg.snapshot());
export const state = async (page: Page): Promise<GameState> => (await snapshot(page)).saves.find(s => s.slotId === 'auto')!.game;
export const geometry = (maze: MazeState) => ({ rows: maze.rows, columns: maze.columns, cells: maze.cells,
  start: maze.start, end: maze.end, layout: maze.layout });

export async function open(page: Page, scenario: string) {
  await page.goto(`/tests/e2e/d1-rpg-fixture.html?case=${scenario}`);
  await expect(page.locator('.screen-status')).toContainText('Ready');
}

export async function reload(page: Page) {
  const session = await page.evaluate(() => window.d1Rpg.session);
  const town = (await state(page)).mode === 'town';
  await page.reload();
  await expect.poll(() => page.evaluate(previous => Boolean(window.d1Rpg && window.d1Rpg.session !== previous), session)).toBe(true);
  if (town) await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  else await expect(page.locator('.screen-status')).toContainText('Ready');
  expect(await page.evaluate(() => window.d1Rpg.seedCount)).toBe(1);
}

export async function move(page: Page, direction: Direction, floor?: number) {
  const before = await state(page), target = movePosition(before.maze.active, direction);
  const keys = { north: 'ArrowUp', east: 'ArrowRight', south: 'ArrowDown', west: 'ArrowLeft' };
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    await page.getByRole('button', { name: `Move ${direction}`, exact: true }).tap();
  } else await page.keyboard.press(keys[direction]);
  if (floor !== undefined) await expect.poll(async () => (await state(page)).dungeonLevel, { intervals: [25, 50] }).toBe(floor);
  else await expect.poll(async () => (await state(page)).maze.active, { intervals: [25, 50] }).toEqual(target);
}

export async function walk(page: Page, target: GridPosition, floor?: number) {
  const route = findPath((await state(page)).maze, target);
  expect(route, 'Fixture target must be reachable through real links').toBeDefined();
  expect(route!.distance).toBeLessThan(180);
  for (const [i, direction] of route!.directions.entries()) await move(page, direction, i === route!.distance - 1 ? floor : undefined);
}

export function ordinaryDirection(game: GameState): Direction {
  const cell = game.maze.cells.find(c => samePosition(c, game.maze.active))!;
  const direction = cell.links.find(d => ![game.maze.start, game.maze.end].some(p => samePosition(p, movePosition(cell, d))));
  if (!direction) throw new Error('Fixture needs a non-stair move');
  return direction;
}

export async function stop(page: Page) {
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await expect.poll(async () => (await state(page)).automationPaused).toBe(true);
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
}

export async function pixels(page: Page, info: TestInfo, name: string) {
  const canvas = page.getByLabel('Dungeon map');
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => {
    const box = c.getBoundingClientRect(), data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<string>();
    let bright = 0, opaque = true;
    for (let i = 0; i < data.length; i += 64) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      if (data[i] > 45 && data[i + 1] > 45 && data[i + 2] > 45) bright++;
      opaque &&= data[i + 3] === 255;
    }
    return colors.size > 20 && bright > 20 && opaque && box.width > 100 && box.height > 100
      && box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
      && c.width === Math.floor(Math.floor(box.width) * devicePixelRatio)
      && c.height === Math.floor(Math.floor(box.height) * devicePixelRatio);
  })).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

export async function manualSave(page: Page) {
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'New save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Saves', exact: true }).getByRole('status')).toHaveText('Manual save created.');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  return (await snapshot(page)).saves.find(s => s.kind === 'manual')!;
}

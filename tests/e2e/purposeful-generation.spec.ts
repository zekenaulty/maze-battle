import { test, expect, type Page } from '@playwright/test';
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function state(page: Page) { return page.evaluate(async () => {
  const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
  const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
  const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
  const { head } = await readCanonicalHead(), game = (await projectGame(head)).value, scene = compileStageScene(game)!;
  return { checkpoint: game.checkpoint, spaces: game.observation!.header.spaces, spatial: game.spatial,
    shelves: scene.boxes.filter(b => b.material === 'bookshelf').length, flights: scene.flights?.length ?? 0,
    doors: scene.doors?.length ?? 0, cells: scene.cells.length };
}); }

test('fresh production games use empty furnishing policy through walking, 2D/3D switching and native reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=stage3d');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  const initial = await state(page);
  expect(initial.spaces!.filter(s => s.kind === 'room').every(s => s.furnishing === 'none')).toBe(true);
  expect(initial.shelves).toBe(0);
  await page.screenshot({ path: info.outputPath('fresh-open-chamber.png') });
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page)).checkpoint.position.cell.column).toBe(initial.checkpoint.position.cell.column + 1);
  const moved = (await state(page)).checkpoint.position;
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(canvas(page)).toBeVisible(); expect((await state(page)).shelves).toBe(0);
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).checkpoint.position).toEqual(moved);
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
});

test('open generated stair rooms retain continuous down/up travel and reload with no arbitrary furnishing', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&open');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await state(page)).spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  const initial = await state(page);
  expect(initial.flights).toBeGreaterThan(0); expect(initial.doors).toBeGreaterThan(0); expect(initial.shelves).toBe(0);
  expect(initial.spatial!.rooms!.every(r => r.furnishing === 'none')).toBe(true);
  await page.screenshot({ path: info.outputPath('open-upper-stairwell.png') });
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeCloseTo(-4.98, 2);
  await page.keyboard.up('w');
  expect((await state(page)).shelves).toBe(0);
  await page.screenshot({ path: info.outputPath('open-lower-stairwell.png') });
  await page.keyboard.down('s');
  await expect.poll(async () => (await state(page)).checkpoint.position.level, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeGreaterThan(-.03);
  await page.keyboard.up('s');
  expect((await state(page)).checkpoint.position).toEqual(initial.checkpoint.position);
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).checkpoint.position).toEqual(initial.checkpoint.position);
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
});

import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function look(page: Page, yaw: number, pitch = 0) {
  for (let i = 0; i < 10; i++) {
    const actual = Number(await canvas(page).getAttribute('data-yaw')), difference = yaw - actual;
    if (Math.abs(difference) < .02) break;
    const b = (await canvas(page).boundingBox())!, dx = Math.max(-450, Math.min(450, -difference / .0025));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 4 }); await page.mouse.up();
  }
  if (pitch) { const b = (await canvas(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - pitch / .0025, { steps: 4 }); await page.mouse.up(); }
}
async function state(page: Page) { return page.evaluate(async () => {
  const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
  const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
  const { head } = await readCanonicalHead(); return { head, game: (await projectGame(head)).value };
}); }
async function prepared(page: Page) {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  const before = await state(page);
  await page.getByRole('button', { name: 'Prepare adjacent landing' }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Prepare adjacent landing' })).toHaveCount(0);
  const after = await state(page);
  expect(after.game.checkpoint.position).toEqual(before.game.checkpoint.position);
  expect(after.head.roots.knowledge).toBe(before.head.roots.knowledge);
  expect(after.game.spatial?.connector?.cells.length).toBeGreaterThan(0);
  expect(after.game.spatial!.connector!.cells.length).toBeLessThanOrEqual(5);
  expect(after.game.spatial!.connector!.cells.every((c: any) => c.chests.length === 0 && c.stairs.length === 0)).toBe(true);
  return after;
}
test('seeded real stairs prepare separately, cross continuously, reverse, reload and preserve 2D knowledge', async ({ page }, info) => {
  const after = await prepared(page), node = await canvas(page).elementHandle();
  await look(page, 0, -.55); await page.screenshot({ path: info.outputPath('upper-landing.png') });
  await look(page, 0, .55);
  await page.evaluate(() => {
    const probe = { active: true, samples: [] as unknown[] }; (window as any).__stairProbe = probe;
    const tick = (t: number) => {
      const c = document.querySelector<HTMLCanvasElement>('[aria-label="Explorable 3D dungeon"]');
      if (!probe.active || !c) return;
      probe.samples.push({ t, pose: c.dataset.pose, y: Number(c.dataset.height), progress: c.dataset.stairProgress, actor: c.dataset.actor }); requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeLessThan(-4.65);
  await page.keyboard.up('w');
  expect(await node!.evaluate(n => n.isConnected)).toBe(true);
  await look(page, Math.PI, .4); await page.screenshot({ path: info.outputPath('lower-landing.png') });
  await look(page, 0, -.4);
  const down = await state(page);
  expect(down.head.revision).toBe(after.head.revision + 1);
  expect(down.game.observation!.cells.every((c: any) => c.at.level === 2)).toBe(true);
  // Reverse on the same flight, without a camera reset or an extra ordinary move.
  await page.keyboard.down('s');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeGreaterThan(-.03);
  await page.keyboard.up('s');
  const up = await state(page); expect(up.head.revision).toBe(down.head.revision + 1);
  const samples = await page.evaluate(() => { const p = (window as any).__stairProbe; p.active = false; return p.samples; });
  await writeFile(info.outputPath('stair-motion.json'), JSON.stringify(samples, null, 2));
  const ys = samples.map((s: any) => s.y), jumps = ys.slice(1).map((y: number, i: number) => Math.abs(y - ys[i]));
  expect(Math.max(...jumps)).toBeLessThan(.16); // capped input step and smooth ramp, including both commits
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  expect((await state(page)).head.revision).toBe(up.head.revision);
  await page.getByRole('button', { name: '3D view', exact: true }).click(); await expect(canvas(page)).toBeVisible();
  await page.reload(); await expect(canvas(page)).toBeVisible();
  expect((await state(page)).game.checkpoint.position).toEqual(up.game.checkpoint.position);
});
test('legacy retained recipe keeps explicit stair travel without acquiring spatial placement', async ({ page }) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&legacy=1');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).game.spatial).toBeUndefined();
  await page.getByRole('button', { name: 'Use down stairs', exact: true }).click();
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 60_000 }).toBe(2);
  expect((await state(page)).game.spatial).toBeUndefined();
});
test('manual save restores spatial placement and the defined committed landing after later travel', async ({ page }) => {
  const source = (await prepared(page)).game.checkpoint.position;
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'New save', exact: true }).click();
  await expect(page.getByText('Manual save created.', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Saves', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await page.keyboard.up('w'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.locator('.save-row').filter({ hasText: 'manual' }).getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Load save', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
  await expect.poll(async () => (await state(page)).game.checkpoint.position).toEqual(source);
  await expect.poll(() => canvas(page).getAttribute('data-stair-progress')).toBe('');
  expect((await state(page)).game.spatial!.connector!.placement.version).toBe('straight-stair-placement-v1');
});
test('interrupted preparation survives reload and blocks walking until the adjacent landing is ready', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&partial=1'); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await page.reload(); await expect(canvas(page)).toBeVisible();
  const before = await state(page); expect(before.game.spatial!.connector!.cells).toEqual([]);
  await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w');
  expect((await state(page)).head.revision).toBe(before.head.revision);
  expect(await canvas(page).getAttribute('data-stair-progress')).toBe('');
  await page.screenshot({ path: info.outputPath('unprepared-barrier.png') });
  await page.getByRole('button', { name: 'Prepare adjacent landing' }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Prepare adjacent landing' })).toHaveCount(0);
  expect((await state(page)).game.checkpoint.position).toEqual(before.game.checkpoint.position);
});
async function dump(page: Page) { return page.evaluate(async () => {
  const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts');
  const db = await openCanonicalDatabase(); try {
    return await Promise.all(['heads','records','nodes','receipts','operations'].map(async store => [store, await db.getAll(store as any)]));
  } finally { db.close(); }
}); }
test('quota failure during spatial preparation is atomic and retry leaves the actor at its source', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  const before = await dump(page), source = (await state(page)).game.checkpoint.position;
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'records') { IDBObjectStore.prototype.add = original; throw new DOMException('Injected spatial preparation failure', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Prepare adjacent landing' }).click();
  await expect(page.getByText(/Action failed:/)).toBeVisible();
  const after = await dump(page); expect(after).toEqual(before);
  await info.attach('spatial-quota-atomic.json', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  await page.reload(); await expect(canvas(page)).toBeVisible();
  await page.getByRole('button', { name: 'Prepare adjacent landing' }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Prepare adjacent landing' })).toHaveCount(0);
  expect((await state(page)).game.checkpoint.position).toEqual(source);
});

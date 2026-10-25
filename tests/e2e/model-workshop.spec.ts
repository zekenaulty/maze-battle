import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const canvasName = 'Model and stair workshop';

test('imported/native controls, material substitution and all-sided inspection share one renderer', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=models'); const canvas = page.getByLabel(canvasName, { exact: true });
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  await expect(page.getByRole('status')).toContainText('Curated TileLab textures');
  await page.getByLabel('Lever on / door open').check(); await page.getByLabel('Lever on / door open').uncheck();
  const count = await canvas.getAttribute('data-geometry-count');
  for (let i = 0; i < 6; i++) {
    await page.getByLabel('Lever on / door open').setChecked(i % 2 === 0);
    await page.getByLabel('Alternate native materials').setChecked(i % 2 === 0);
  }
  await expect(canvas).toHaveAttribute('data-geometry-count', count!);
  for (const view of ['front', 'back', 'left', 'right']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.screenshot({ path: info.outputPath(`models-${view}.png`) });
  }
  await page.getByLabel('Lever on / door open').check(); await page.getByRole('button', { name: 'front', exact: true }).click();
  await page.screenshot({ path: info.outputPath('models-on-door-open.png') });
  await page.getByLabel('Exhibit', { exact: true }).selectOption('stairs');
  await page.getByRole('button', { name: 'right', exact: true }).click(); await page.screenshot({ path: info.outputPath('stairs-side.png') });
  await page.getByRole('button', { name: 'front', exact: true }).click(); await page.screenshot({ path: info.outputPath('stairs-front.png') });
  expect(await page.locator('canvas').count()).toBe(1); expect(errors).toEqual([]);
});

test('two actual decks and one open shaft support continuous ascent/descent without game writes', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=models'); const canvas = page.getByLabel(canvasName, { exact: true });
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  await page.getByLabel('Exhibit', { exact: true }).selectOption('walk');
  const pose = async () => JSON.parse((await canvas.getAttribute('data-pose'))!) as { x: number; y: number; z: number };
  await page.getByRole('button', { name: 'Lower landing', exact: true }).click(); await canvas.focus();
  await page.evaluate(() => {
    const probe = { active: true, frames: [] as Array<{ t: number; y: number; z: number; camera: number }> }; (window as any).__stairProbe = probe;
    const sample = (t: number) => { if (!probe.active) return; const c = document.querySelector<HTMLCanvasElement>('[aria-label="Model and stair workshop"]')!;
      const p = JSON.parse(c.dataset.pose!); probe.frames.push({ t, y: p.y, z: p.z, camera: Number(c.dataset.cameraY) }); requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await page.screenshot({ path: info.outputPath('walk-lower.png') });
  await page.keyboard.down('KeyW');
  try { await expect.poll(async () => (await pose()).z, { timeout: 10_000 }).toBeGreaterThan(7.8); }
  finally { await page.keyboard.up('KeyW'); }
  expect((await pose()).y).toBeCloseTo(4.68);
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-camera-y')) - 6.93)).toBeLessThan(0.05);
  await page.getByRole('button', { name: 'Face stairs', exact: true }).click();
  await page.screenshot({ path: info.outputPath('walk-upper.png') });
  const stopped = await pose();
  await page.getByLabel('Cutaway upper deck').check();
  expect(await pose()).toEqual(stopped);
  await canvas.focus(); await page.keyboard.down('KeyW');
  try { await expect.poll(async () => (await pose()).z, { timeout: 10_000 }).toBeLessThan(-0.1); }
  finally { await page.keyboard.up('KeyW'); }
  expect((await pose()).y).toBe(0);
  const frames = await page.evaluate(() => { const probe = (window as any).__stairProbe; probe.active = false; return probe.frames; });
  expect(frames.length).toBeGreaterThan(100);
  const jumps = frames.slice(1).map((f: any, i: number) => Math.abs(f.y - frames[i].y));
  expect(Math.max(...jumps)).toBeLessThan(0.12);
  await writeFile(info.outputPath('stair-motion.json'), JSON.stringify({ frames, maximumHeightChange: Math.max(...jumps) }));
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  expect(await page.locator('canvas').count()).toBe(1); expect(errors).toEqual([]);
});

test('moving into sidebar focus releases the held key', async ({ page }) => {
  await page.goto('/?view=models'); const canvas = page.getByLabel(canvasName, { exact: true });
  await page.getByLabel('Exhibit', { exact: true }).selectOption('walk'); await canvas.focus();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-pose'))!).z).toBeGreaterThan(-0.6);
  await page.getByLabel('Cutaway upper deck').focus(); await page.keyboard.up('KeyW');
  const stopped = await canvas.getAttribute('data-pose'), frame = Number(await canvas.getAttribute('data-frame'));
  // Wait on frame progress, not an arbitrary delay, while checking the position remains fixed.
  await expect.poll(async () => Number(await canvas.getAttribute('data-frame'))).toBeGreaterThan(frame + 5);
  expect(await canvas.getAttribute('data-pose')).toBe(stopped);
});

test('mobile workshop remains inspectable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?view=models&exhibit=stairs');
  await expect(page.getByLabel(canvasName, { exact: true })).toBeVisible();
  await page.getByLabel('Exhibit', { exact: true }).selectOption('walk'); await page.getByRole('button', { name: 'Upper landing', exact: true }).click();
  await page.screenshot({ path: info.outputPath('mobile-upper-landing.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

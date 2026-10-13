import { test, expect } from '@playwright/test';
import type {} from './click-navigation-fixture';

for (const corruption of ['history', 'control']) test(`actual App recovers from invalid ${corruption}`, async ({ page, context }, info) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5203') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto(`/tests/e2e/click-navigation-fixture.html?corrupt=${corruption}`);
  await expect(page.getByRole('status')).toContainText('Load failed');
  const before = await page.evaluate(() => window.clickRpg.snapshot());
  await page.waitForTimeout(1600); // More than two periodic refreshes must not hide the failure.
  await expect(page.getByRole('status')).toContainText('Load failed');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Reset and start new game', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => window.clickRpg.snapshot())).toEqual(before);
  await page.getByRole('button', { name: 'Reset and start new game', exact: true }).click();
  await page.getByRole('button', { name: 'Discard saves and start new game', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Dungeon map', { exact: true })).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Map evidence unavailable', { exact: true })).toHaveCount(0);
  const after = await page.evaluate(() => window.clickRpg.snapshot());
  expect(after.saves).toHaveLength(1);
  expect(after.saves[0].game.id).not.toBe(before.saves[0].game.id);
  expect(after.saves[0].observationHead).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Dungeon map', { exact: true })).not.toHaveAttribute('aria-busy', 'true');
  expect((await page.evaluate(() => window.clickRpg.snapshot())).saves[0].game.id).toBe(after.saves[0].game.id);
  await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < pixels.length; i += 64) colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
    return colors.size;
  })).toBeGreaterThan(20);
  await page.screenshot({ path: info.outputPath('recovered-game.png') });
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`directed play ${viewport.width}: readable map, travel, reload, arrival and explicit interaction`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?expedition=3');
    await expect(page.getByRole('heading', { name: 'Directed Expedition' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Travel', exact: true })).toBeEnabled();
    await expect(page.getByRole('status', { name: 'Travel status' })).toHaveText('Ready.');
    const canvas = page.locator('canvas[aria-label="Discovered dungeon"]');
    await expect(canvas).toBeVisible();
    const pixels = await canvas.evaluate((node: HTMLCanvasElement) => {
      const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      let lit = 0; const colors = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 13) {
        if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { lit, colors: colors.size };
    });
    expect(pixels.lit).toBeGreaterThan(50); expect(pixels.colors).toBeGreaterThan(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await canvas.boundingBox(); expect(bounds!.height).toBeGreaterThan(300);
    await page.screenshot({ path: info.outputPath(`directed-${viewport.width}-start.png`) });
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await expect.poll(() => page.locator('main').getAttribute('data-steps')).not.toBe('0');
    await page.getByRole('button', { name: 'Pause travel' }).click();
    await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel paused');
    const paused = await page.locator('main').getAttribute('data-steps');
    await page.reload();
    await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel paused');
    await expect(page.locator('main')).toHaveAttribute('data-steps', paused!);
    await page.getByRole('button', { name: 'Resume travel' }).click();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'arrived');
    await expect(page.getByText('Lever: idle (current)')).toBeVisible();
    await page.getByRole('button', { name: 'Interact with destination' }).click();
    await expect(page.getByText('Lever: active (current)')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`directed-${viewport.width}-arrived.png`) });
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await expect(page.getByText('0 (host-only)')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a second tab needs explicit takeover and cannot continue the revoked intention', async ({ page, context }) => {
  await page.goto('/?expedition=3');
  await page.getByRole('button', { name: 'Travel', exact: true }).click();
  await page.getByRole('button', { name: 'Pause travel' }).click();
  const other = await context.newPage(); await other.goto('/?expedition=3');
  await expect(other.getByRole('button', { name: 'Travel', exact: true })).toBeDisabled();
  await other.getByRole('button', { name: 'Take control' }).click();
  await expect(other.locator('main')).toHaveAttribute('data-operation', 'cancelled');
  await page.getByRole('button', { name: 'Resume travel' }).click();
  await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Another controller owns this save');
  await expect(other.locator('main')).toHaveAttribute('data-operation', 'cancelled');
});

test('ordinary and earlier expedition entry points still render independently', async ({ page }) => {
  for (const path of ['/', '/?expedition=1', '/?expedition=2']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Directed Expedition' })).toHaveCount(0);
  }
});

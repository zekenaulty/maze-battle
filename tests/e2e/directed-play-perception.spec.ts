import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`inspection ${viewport.width}: actor-equivalent details, bounded controls and reload`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?expedition=3&perception=expert');
    await page.getByLabel('Destination', { exact: true }).selectOption('T');
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'arrived');
    await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText(/pressure-sensitive/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Inspect west', exact: true }).click();
    await expect(page.getByText(/pressure-sensitive/)).toBeVisible();
    await expect(page.getByText('west, detail', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const canvas = page.locator('canvas');
    expect((await canvas.boundingBox())!.height).toBeGreaterThan(300);
    await page.screenshot({ path: info.outputPath(`inspection-${viewport.width}.png`) });
    await page.reload();
    await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText(/pressure-sensitive/)).toBeVisible();
    await expect(page.getByLabel('Perception fixture')).toHaveValue('expert');
    expect(errors).toEqual([]);
  });
}

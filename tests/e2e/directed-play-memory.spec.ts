import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`memory ${viewport.width}: scoped rooms and exact distant destination recall`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/?expedition=3');
    await page.getByRole('tab', { name: 'Memory', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Memory', exact: true });
    await expect(panel.getByRole('button', { name: 'Recall Lever Room', exact: true })).toBeVisible();
    await expect(panel.getByRole('cell', { name: 'Distant', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('canvas').boundingBox())!.height).toBeGreaterThan(300);
    await page.screenshot({ path: info.outputPath(`memory-${viewport.width}-overview.png`) });
    await panel.getByRole('button', { name: 'Recall destination', exact: true }).click();
    await expect(panel.getByText('Lever', { exact: true })).toBeVisible();
    await expect(panel.getByText('stale', { exact: true })).toBeVisible();
    await expect(panel.getByText('Uninspected', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`memory-${viewport.width}-recall.png`) });
    await panel.getByText(/^Observation records \(/).click();
    await panel.getByRole('button', { name: 'Retrieve observation', exact: true }).click();
    const source = panel.getByLabel('Observation record');
    await expect(source).toContainText('directed-sources-v1');
    await expect(source).not.toContainText('sourceWorldRevision');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`memory-${viewport.width}-source.png`) });
  });
}

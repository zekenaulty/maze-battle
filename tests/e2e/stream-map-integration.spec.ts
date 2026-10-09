import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 640 }]) {
  test(`level 19 map pauses play and remains bounded at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/?expedition=2');
    await expect(page.locator('.stream-screen')).toBeVisible();
    const original = await page.evaluate(async () => JSON.stringify(await (await import('/src/persistence/streamRepository.ts')).loadStreamSnapshot('streamed-demo')));
    await page.goto('/?expedition=2&level=19');
    await expect(page.locator('.stream-screen header')).toContainText('Floor 19');
    await page.getByRole('slider', { name: 'Exploration pace' }).fill('20');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('.stream-screen').getAttribute('data-visited-spaces'))).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Discovered map', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Discovered rooms', exact: true })).toBeVisible();
    await expect(page.locator('.stream-map-drawing')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeDisabled();
    await page.waitForTimeout(150);
    const revision = await page.locator('.stream-screen').getAttribute('data-revision');
    await page.keyboard.press('w'); await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await expect(page.locator('.stream-screen')).toHaveAttribute('data-revision', revision!);
    expect(Number(await page.locator('.stream-map-panel').getAttribute('data-summary-count'))).toBeLessThanOrEqual(12);
    await expect(page.locator('.stream-map-panel')).toHaveAttribute('data-room-page-count', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('level19-discovered-map.png') });
    await page.getByRole('button', { name: 'Return to dungeon', exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.reload();
    await expect(page.locator('.stream-screen')).toHaveAttribute('data-revision', revision!);
    const saved = await page.evaluate(async () => {
      const api = await import('/src/persistence/streamRepository.ts');
      return { levelOne: JSON.stringify(await api.loadStreamSnapshot('streamed-demo')),
        level19: (await api.loadStreamSnapshot('streamed-demo-level-19')).checkpoint };
    });
    expect(saved.levelOne).toBe(original);
    expect(saved.level19.floorId).toBe('floor-19');
    expect(Number(await page.locator('.stream-screen').getAttribute('data-resident-cells'))).toBeLessThanOrEqual(512);
  });
}

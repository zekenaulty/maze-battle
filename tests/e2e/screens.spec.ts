import { expect, test } from '@playwright/test';

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 780 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
  test(`screen layouts and interactions at ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/tests/e2e/screens-fixture.html');
    await expect(page.getByRole('button', { name: 'Portal (1)' })).toBeVisible();
    await expect(page.getByText(/No route to remaining/)).toBeVisible();
    const maze = await page.locator('.maze-stage').boundingBox();
    const header = await page.locator('.screen-bar').boundingBox();
    expect(maze!.height).toBeGreaterThan(size.height * 0.5);
    expect(maze!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    await expectNoHorizontalOverflow(page);
    await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set<string>();
      for (let i = 0; i < data.length; i += 256) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colors.size;
    })).toBeGreaterThan(10);
    await page.screenshot({ path: info.outputPath('explore.png') });
    await page.getByRole('button', { name: 'Stop Auto' }).click();
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Diagnostics' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-diagnostics', 'opened');
    await page.getByRole('button', { name: 'Expedition settings' }).click();
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await expect(page.locator('body')).not.toHaveAttribute('data-new-game');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto('/tests/e2e/screens-fixture.html?screen=battle');
    await expect(page.getByRole('button', { name: 'Slash', exact: true })).toBeVisible();
    const toolbar = await page.locator('.screen-bar').boundingBox();
    const toolbarActions = await page.getByRole('navigation', { name: 'Battle actions' }).boundingBox();
    expect(toolbarActions!.y + toolbarActions!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height);
    const enemy = await page.locator('.enemy-card').boundingBox();
    const field = await page.locator('.battlefield').boundingBox();
    expect(enemy!.y + enemy!.height).toBeLessThanOrEqual(field!.y + field!.height);
    const action = page.getByRole('button', { name: 'Slash', exact: true });
    await action.scrollIntoViewIfNeeded();
    const before = await action.boundingBox();
    await action.click();
    const after = await action.boundingBox();
    expect(after).toEqual(before);
    if (size.width <= 700 || size.height <= 540) {
      await page.getByRole('navigation', { name: 'Battle party members' }).getByRole('button', { name: /Zyth/ }).click();
      await expect(page.locator('.battle-character:visible')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Magic Missiles', exact: true })).toBeVisible();
    }
    if (size.height <= 540) {
      await page.getByRole('button', { name: 'Teleport', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Stop Auto' })).toBeInViewport();
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath('battle.png') });
    const panelBefore = await page.locator('.battle-bottom').boundingBox();
    await page.getByRole('tab', { name: 'Log', exact: true }).click();
    await expect(page.getByLabel('Battle log')).toBeVisible();
    await expect(page.locator('.battle-character-vitals:visible').first()).toBeVisible();
    const panelAfter = await page.locator('.battle-bottom').boundingBox();
    expect(panelAfter!.width).toBe(panelBefore!.width);
    expect(panelAfter!.height).toBe(panelBefore!.height);
    await page.screenshot({ path: info.outputPath('battle-log.png') });
    await page.getByRole('button', { name: 'Diagnostics' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-diagnostics', 'opened');

    await page.goto('/tests/e2e/screens-fixture.html?screen=town');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath('town.png') });
    const townTabs = page.getByRole('tablist', { name: 'Town services' });
    for (const name of ['Guild', 'Blacksmith', 'Alchemist', 'Storage', 'Inn', 'Auto Care']) {
      await townTabs.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
      await expect(townTabs).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Stop Auto', exact: true })).toBeInViewport();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`town-${name.toLowerCase().replace(' ', '-')}.png`) });
    }
    await townTabs.getByRole('tab', { name: 'Storage', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search storage' }).fill('Stored sword 12');
    await townTabs.getByRole('tab', { name: 'Inn', exact: true }).click();
    await townTabs.getByRole('tab', { name: 'Storage', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search storage' })).toHaveValue('Stored sword 12');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByText('No matching items.')).toBeVisible();
    await page.getByRole('button', { name: 'Diagnostics' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-diagnostics', 'opened');
    expect(errors).toEqual([]);
  });
}

test('native saves modal traps focus, confirms deletion, and restores focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/tests/e2e/screens-fixture.html');
  const trigger = page.getByRole('button', { name: 'Saves', exact: true });
  await trigger.click();
  const saves = page.getByRole('dialog', { name: 'Saves', exact: true });
  await expect(saves).toBeVisible();
  await page.screenshot({ path: info.outputPath('saves.png') });
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(await saves.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.save-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.save-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete save', exact: true }).click();
  await expect(page.locator('.save-row')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(saves).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overflow = await page.locator('main').evaluate((main) => main.scrollWidth > main.clientWidth);
  expect(overflow).toBe(false);
}

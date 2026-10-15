import { test, expect } from '@playwright/test';

test('actual App disables the seventeenth save, keeps Delete usable, and reopens a freed slot', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  const create = page.getByRole('button', { name: 'New save', exact: true });
  for (let count = 1; count <= 16; count++) {
    await create.click();
    await expect(page.locator('#manual-save-capacity')).toHaveText(`${count} / 16 manual saves${count === 16 ? '. Limit reached.' : ''}`);
  }
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription('16 / 16 manual saves. Limit reached.');
  await expect(page.getByRole('button', { name: 'Reset and start new game' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete save', exact: true }).click();
  await expect(page.locator('#manual-save-capacity')).toHaveText('15 / 16 manual saves');
  await expect(create).toBeEnabled();
  await create.click(); await expect(create).toBeDisabled();
  await expect(page.locator('#manual-save-capacity')).toHaveText('16 / 16 manual saves. Limit reached.');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(page.locator('#manual-save-capacity')).toHaveText('16 / 16 manual saves. Limit reached.');
  await expect(page.getByRole('button', { name: 'Delete', exact: true }).first()).toBeEnabled();
});

import { expect, test } from '@playwright/test';

test('town opens the accepted journal on demand without changing the saved game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  const offer = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Accept', exact: true }) }).first();
  const title = await offer.locator('strong').textContent();
  await offer.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText(`Accepted quest: ${title}.`, { exact: true })).toBeVisible();
  const readHead = () => page.evaluate(async () =>
    (await (await import('/src/persistence/canonical/read.ts')).readCanonicalHead()).head);
  const before = await readHead();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  const journal = page.getByLabel('Accepted quest journal', { exact: true });
  await expect(journal).not.toHaveAttribute('aria-busy', 'true');
  await expect(journal.getByText(title!, { exact: true })).toBeVisible();
  await expect(journal.getByText('Floor 1', { exact: true })).toBeVisible();
  await expect(journal.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  expect(await readHead()).toEqual(before);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(journal.getByText(title!, { exact: true })).toBeVisible();
});

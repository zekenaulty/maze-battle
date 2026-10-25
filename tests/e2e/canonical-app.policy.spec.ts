import { expect, test } from '@playwright/test';

for (const surface of ['town', 'inventory'] as const) test(`${surface} reserve inputs reject invalid values without losing control`, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  if (surface === 'town') {
    await page.keyboard.press('t');
    await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Auto Care', exact: true }).click();
  } else {
    await page.keyboard.press('i');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
    await page.getByText('Inventory care', { exact: true }).click();
  }
  const revision = () => page.evaluate(async () =>
    (await (await import('/src/persistence/canonical/read.ts')).readCanonicalHead()).head.revision);
  const before = await revision();
  for (const [label, invalid] of [['Portal reserve', '0'], ['Portal reserve', '6'], ['Health reserve', '21'], ['Mana reserve', '1.5']] as const) {
    const input = page.getByLabel(label, { exact: true }), original = await input.inputValue();
    await input.fill(invalid);
    await expect(input).toHaveValue(original);
    expect(await revision()).toBe(before);
    await expect(page.getByRole('button', { name: 'Take control', exact: true })).toHaveCount(0);
  }
  const portal = page.getByLabel('Portal reserve', { exact: true });
  await portal.fill('5');
  await expect.poll(revision).toBe(before + 1);
  await expect(portal).toHaveValue('5');
  await expect(page.getByRole('button', { name: 'Take control', exact: true })).toHaveCount(0);
});

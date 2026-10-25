import { expect, test } from '@playwright/test';

test('clicking the earned entrance stairs returns to town without spending a scroll', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('Dungeon map', { exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const initial = await page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
    return (await projectGame((await readCanonicalHead()).head)).value;
  });
  const entrance = initial.observation!.cells.find(c => c.stairs.includes('town'))!;
  expect(entrance.at).toEqual(initial.checkpoint.position);
  const portal = page.getByRole('button', { name: /^Portal \(/ });
  const scrollLabel = await portal.textContent();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    return (await readCanonicalHead()).head.revision;
  })).toBeGreaterThan(initial.snapshot.revision);
  await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
  const point = await canvas.evaluate((element, target) => {
    const canvas = element as HTMLCanvasElement, bounds = canvas.getBoundingClientRect();
    const width = Math.floor(bounds.width), height = Math.floor(bounds.height);
    const rows = Number(canvas.dataset.rows), columns = Number(canvas.dataset.columns);
    const cell = Math.floor(Math.min((width - 16) / columns, (height - 16) / rows));
    return {
      x: bounds.x + Math.floor((width - columns * cell) / 2) + (target.column - Number(canvas.dataset.columnStart) + 0.5) * cell,
      y: bounds.y + Math.floor((height - rows * cell) / 2) + (target.row - Number(canvas.dataset.rowStart) + 0.5) * cell,
    };
  }, entrance.world);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(portal).toHaveText(scrollLabel!);
});

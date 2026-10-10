import { expect, test, type Page } from '@playwright/test';
import advanced from '../fixtures/original-saves/advanced.json' with { type: 'json' };

async function read(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/persistence/gameCustody.ts';
    return (await import(/* @vite-ignore */ path)).readGameControl();
  });
}

for (const modern of [false, true]) test(`original import and malformed-source recovery in the mounted app, existing game ${modern}`, async ({ page }) => {
  await page.goto('/tests/e2e/pr1-custody-fixture.html');
  await page.waitForFunction(() => !!window.ordinaryCustody);
  await page.evaluate(async ({ state, modern }) => {
    localStorage.setItem('DC-GAME-SAVE-SLOTS', '["Broken","Advanced"]');
    localStorage.setItem('DC-GAME-BROKEN', '{invalid');
    localStorage.setItem('DC-GAME-ADVANCED', JSON.stringify(state));
    if (modern) {
      const h = window.ordinaryCustody, game = h.createNewGameState({ id: 'modern-survivor' });
      game.inventory.gold = 812;
      await h.repository.saveGame('auto', 'Auto Save', 'auto', game);
    }
  }, { state: advanced.state, modern });
  await page.goto('/');
  await expect(page.locator('.explore-screen')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('DC-GAME-BROKEN');
  await expect(page.getByRole('button', { name: 'Take control' })).toHaveCount(0);
  const initial = await read(page);
  if (modern) {
    expect(initial.game.id).toBe('modern-survivor');
    expect(initial.game.inventory.gold).toBe(812);
  }
  expect(await page.evaluate(() => ({ bad: localStorage.getItem('DC-GAME-BROKEN'),
    good: localStorage.getItem('DC-GAME-ADVANCED'), index: localStorage.getItem('DC-GAME-SAVE-SLOTS') })))
    .toEqual({ bad: '{invalid', good: null, index: '["Broken"]' });

  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  const row = page.getByRole('dialog', { name: 'Saves', exact: true }).locator('.save-row').filter({ hasText: 'Advanced' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('dialog', { name: 'Load save?', exact: true }).getByRole('button', { name: 'Load save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Saves', exact: true })).toHaveCount(0);
  const restored = await read(page);
  expect(restored.control.epoch).toBe(initial.control.epoch);
  expect(restored.control.revision).toBeGreaterThan(initial.control.revision);
  expect(restored.game.inventory.gold).toBe(137);
  expect(restored.game.maze.active).toEqual(advanced.state.maze.active);
  advanced.expected.forEach((actor, i) => expect(restored.game.party[i]).toMatchObject(actor));
  await page.reload();
  await expect(page.locator('.explore-screen')).toBeVisible();
  const reloaded = await read(page);
  expect(reloaded.game).toEqual(restored.game);
  expect(reloaded.control.epoch).toBeGreaterThan(restored.control.epoch);
});

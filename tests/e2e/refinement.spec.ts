import { expect, test, type Page } from '@playwright/test';
import { createNewGameState } from '../../src/domain/gameFactory';
import type { GameState } from '../../src/domain/types';
import { createItemInstance } from '../../src/domain/items/loot';

async function seed(page: Page, game: GameState) {
  await page.goto('/tests/e2e/refinement-fixture.html');
  await page.evaluate(async state => {
    const path = '/src/persistence/saveRepository.ts';
    const repository = await import(/* @vite-ignore */ path);
    await repository.saveGame('auto', 'Auto Save', 'auto', state);
  }, game);
  await page.goto('/');
  await expect(page.locator('.game-screen')).toBeVisible();
}

async function saved(page: Page): Promise<GameState> {
  return page.evaluate(async () => {
    const path = '/src/persistence/saveRepository.ts';
    const repository = await import(/* @vite-ignore */ path);
    return (await repository.getGame('auto')).game;
  });
}

test('toolbar and inventory portals share stock and preserve resources through reload', async ({ page }) => {
  const game = createNewGameState({ randomBattles: false });
  const scroll = game.inventory.items.find(i => i.consumableEffect === 'townPortal')!;
  scroll.quantity = 2;
  await seed(page, game);
  await page.getByRole('button', { name: 'Portal (2)', exact: true }).click();
  await expect(page.locator('.town-screen')).toBeVisible();
  await expect.poll(async () => (await saved(page)).inventory.items.find(i => i.id === scroll.id)?.quantity).toBe(1);
  await page.reload();
  await expect(page.locator('.town-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Portal (1)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  await page.locator('.inventory-item').filter({ hasText: 'Town Portal' }).getByRole('button', { name: /Use/ }).click();
  await expect(page.locator('.town-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Portal (0)', exact: true })).toBeDisabled();
  await expect.poll(async () => (await saved(page)).inventory.items.filter(i => i.consumableEffect === 'townPortal').length).toBe(0);
  const after = await saved(page);
  expect(after.maze.active).toEqual(game.maze.active);
  expect(after.floors[0].maze.layout?.connections).toEqual(game.floors[0].maze.layout?.connections);
});

test('atomic stop persists without changing character auto preferences', async ({ page }) => {
  const game = createNewGameState({ randomBattles: false, autoThrottleMs: 500 });
  game.party[0].autoBattle = false;
  await seed(page, game);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Auto', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await expect.poll(async () => (await saved(page)).automationPaused).toBe(true);
  const stopped = await saved(page);
  await page.waitForTimeout(1100);
  expect((await saved(page)).maze.active).toEqual(stopped.maze.active);
  expect(stopped.party.map(a => a.autoBattle)).toEqual([false, true, true]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await saved(page)).automationPaused).toBe(true);
});

test('auto repairs an overfull pack and obsolete stash through a paid town visit', async ({ page }) => {
  const game = createNewGameState({ randomBattles: false, autoThrottleMs: 250 });
  const gear = (id: string, damage: number) => ({ ...createItemInstance('iron-sword', 1), id, stats: { baseDamage: damage }, affixes: [], value: 10 });
  const equipped = [0, 1, 2].map(i => gear(`equipped-${i}`, 20));
  game.party.forEach((actor, i) => { actor.equipment.weapon = equipped[i].id; });
  const locked = { ...gear('locked-relic', 1), locked: true };
  game.inventory.items.push(...equipped, locked, ...Array.from({ length: 222 }, (_, i) => gear(`junk-${i}`, 1)));
  game.stash.items = Array.from({ length: 40 }, (_, i) => gear(`stash-junk-${i}`, 1));
  expect(game.inventory.items).toHaveLength(229);
  await seed(page, game);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await saved(page)).inventory.items.length, { timeout: 15000 }).toBeLessThan(36);
  const current = await saved(page);
  expect(current.inventory.items.find(i => i.id === locked.id)?.locked).toBe(true);
  expect(current.inventory.items.filter(i => i.id.startsWith('junk-'))).toHaveLength(0);
  expect(current.stash.items.filter(i => i.id.startsWith('stash-junk-'))).toHaveLength(0);
  expect(current.inventory.gold).toBeGreaterThan(game.inventory.gold);
  expect(current.party.map(a => a.equipment.weapon)).toEqual(equipped.map(i => i.id));
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
});

test('diagnostics self-play is bounded, exportable, and isolated from the player save', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page, createNewGameState({ randomBattles: false }));
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect.poll(async () => (await saved(page)).automationPaused).toBe(true);
  const before = await saved(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('maze');
  await page.getByRole('button', { name: 'Self-play', exact: true }).click();
  await page.getByLabel('Simulation floors').fill('1');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.simulation-panel [role="status"]')).toContainText('complete:', { timeout: 40000 });
  expect(await saved(page)).toEqual(before);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.locator('.diagnostic-metrics')).toContainText('2 / 0');
});

test('character stats, healing and guarded gear recommendations execute through the live app', async ({ page }, info) => {
  const game = createNewGameState({ randomBattles: false });
  game.party[0].hp = 1;
  game.party[0].attributes.available = 2;
  game.party[0].autoSpendPoints = false;
  const sword = { ...createItemInstance('iron-sword', 1), id: 'good-sword', stats: { baseDamage: 20 }, affixes: [] };
  const misleading = { ...sword, id: 'bad-tradeoff', displayName: 'Misleading Score Sword', stats: { baseDamage: 15, maxHp: 1, intellect: 500 } };
  game.inventory.items.push(sword, misleading);
  game.party[0].equipment.weapon = sword.id;
  await seed(page, game);
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Auto-spend points' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Increase Vitality' }).click();
  await expect.poll(async () => (await saved(page)).party[0].attributes.available).toBe(1);
  expect((await saved(page)).party[0].maxHp).toBe(game.party[0].maxHp + 2);
  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  const row = page.locator('[data-item-id="bad-tradeoff"]');
  await expect(row.locator('[data-gear-decision]')).toHaveAttribute('data-gear-decision', 'obsolete');
  await expect(row).toContainText('Not recommended');
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('tradeoff-reason.png') });
  await page.getByRole('group', { name: 'Character selection' }).getByRole('button', { name: /Ayla/ }).click();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  await page.getByRole('button', { name: 'Cast Heal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cast Heal', exact: true })).toBeDisabled();
  await expect.poll(async () => (await saved(page)).party[0].hp).toBeGreaterThan(1);
  expect((await saved(page)).party.find(a => a.role === 'healer')!.mp).toBe(game.party.find(a => a.role === 'healer')!.mp - 4);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Portal (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await page.getByRole('group', { name: 'Character selection' }).getByRole('button', { name: /Zyth/ }).click();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cast Teleport', exact: true })).toBeDisabled();
  await expect(page.locator('.character-skill').filter({ hasText: 'Teleport' })).toContainText('Dungeon only');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`real screen layout and canvas at ${viewport.width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await seed(page, createNewGameState({ randomBattles: false, autoThrottleMs: 1500 }));
    const screenshot = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${viewport.width}.png`) });
    };
    const colors = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const values = new Set<number>();
      for (let i = 0; i < data.length; i += 64) values.add(data[i] * 65536 + data[i + 1] * 256 + data[i + 2]);
      return values.size;
    });
    expect(colors).toBeGreaterThan(24);
    await screenshot('explore');
    await page.getByRole('button', { name: 'Party', exact: true }).click();
    for (const tab of ['Stats', 'Equipment', 'Skills', 'Inventory']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await screenshot(`characters-${tab}`);
    }
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Portal (1)', exact: true }).click();
    await screenshot('town');
    await page.getByRole('button', { name: 'Saves', exact: true }).click();
    await screenshot('saves');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
    await page.getByRole('button', { name: 'Waves', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
    await expect(page.locator('.enemy-card').first()).toBeVisible();
    await screenshot('battle');
    await page.getByRole('tab', { name: 'Log', exact: true }).click();
    await screenshot('battle-log');
    expect(errors).toEqual([]);
  });
}

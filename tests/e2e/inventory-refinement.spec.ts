import { expect, test, type Page } from '@playwright/test';
import { createNewGameState } from '../../src/domain/gameFactory';
import { createItemInstance } from '../../src/domain/items/loot';
import { getSellValue, packSlotUsage } from '../../src/domain/items/inventory';
import type { GameState, ItemCategory } from '../../src/domain/types';

async function saved(page: Page): Promise<GameState> {
  return page.evaluate(async () => {
    const path = '/src/persistence/saveRepository.ts';
    return (await (await import(/* @vite-ignore */ path)).getGame('auto')).game;
  });
}

for (const width of [1440, 390]) {
  test(`stack sales and worn capacity survive live workflows at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const game = createNewGameState({ mode: 'town', randomBattles: false, automationPaused: true });
    const sword = { ...createItemInstance('iron-sword', 1), id: 'worn-sword' };
    const wand = { ...createItemInstance('oak-wand', 1), id: 'worn-wand' };
    const herb = { ...createItemInstance('health-herb', 1), id: 'herb', quantity: 3 };
    const legacy = { ...herb, id: 'legacy-herb', itemLevel: 19, value: 44, quantity: 2 };
    const mana = { ...createItemInstance('mana-vial', 1), id: 'mana' };
    const quest = { ...mana, id: 'quest', displayName: 'Guild Seal', category: 'quest' as ItemCategory, consumableEffect: undefined };
    game.inventory = { capacity: 4, gold: 200, items: [sword, wand, herb, legacy, mana, quest] };
    game.stash.items = [{ ...mana, id: 'stashed-mana', quantity: 4 }];
    game.party[0].equipment.weapon = sword.id;
    game.party[1].equipment.weapon = wand.id;
    game.inventoryPolicy = { ...game.inventoryPolicy!, autoEquip: false };
    const resale = getSellValue(herb, 3) + getSellValue(legacy, 2);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/e2e/refinement-fixture.html');
    await page.evaluate(async state => {
      const path = '/src/persistence/saveRepository.ts';
      await (await import(/* @vite-ignore */ path)).saveGame('auto', 'Auto Save', 'auto', state);
    }, game);
    await page.goto('/');
    await expect(page.locator('.town-screen .screen-status')).toContainText('Pack 3/4');
    const portal = page.locator('.vendor-card .town-stock-row').filter({ hasText: 'Town Portal' });
    await expect(portal.getByRole('button', { name: 'Buy 14g' })).toBeEnabled();
    await portal.getByRole('button', { name: 'Buy 14g' }).click();
    await expect(page.locator('.screen-status')).toContainText('Pack 4/4');
    const storedMana = page.locator('.town-storage-list .town-stock-row').filter({ hasText: 'Mana Vial' });
    await expect(storedMana.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    await storedMana.getByRole('button', { name: 'Withdraw' }).click();
    await expect(storedMana).toHaveCount(0);
    await page.getByRole('button', { name: 'Party', exact: true }).click();
    await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
    await expect(page.getByRole('button', { name: `Unequip Iron Sword from ${game.party[0].displayName}` })).toBeDisabled();
    await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
    await expect(page.locator('.inventory-panel header')).toContainText('Pack 4/4');
    await expect(page.locator('[data-item-id="quest"]').getByRole('button', { name: 'Sell One', exact: true })).toBeDisabled();
    await expect(page.locator('[data-item-id="worn-sword"]').getByRole('button', { name: 'Sell One', exact: true })).toBeDisabled();
    const row = page.locator('[data-item-id="herb"]');
    await expect(row).toContainText('Health Herb x5');
    await expect(row).not.toContainText('Lv 19');
    await expect(row.getByRole('button', { name: `Sell All (5) ${resale}g`, exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Sell One 11g', exact: true }).click();
    await expect(row).toContainText('Health Herb x4');
    await row.getByRole('slider').fill('2');
    await expect(row.getByRole('button', { name: 'Sell 2 22g', exact: true })).toBeEnabled();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`stack-sales-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const box of await row.locator('button, input').evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect(); return { left: rect.left, right: rect.right };
    }))) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
    await row.getByRole('button', { name: 'Sell 2 22g', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Sell All (2) 23g', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Sell All (2) 23g', exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(page.locator('.inventory-panel header')).toContainText(`Gold ${186 + resale} - Pack 3/4`);
    await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
    await page.getByRole('button', { name: `Unequip Iron Sword from ${game.party[0].displayName}` }).click();
    await expect.poll(async () => packSlotUsage(await saved(page))).toBe(4);
    const final = await saved(page);
    expect(final.inventory.gold).toBe(186 + resale);
    expect(final.party[0].equipment.weapon).toBeUndefined();
    expect(final.party[1].equipment.weapon).toBe(wand.id);
    expect(final.inventory.items.find(item => item.id === mana.id)?.quantity).toBe(5);
    expect(final.inventory.items.some(item => item.id === quest.id)).toBe(true);
    await page.reload();
    await expect(page.locator('.town-screen .screen-status')).toContainText(`Gold ${186 + resale} - Pack 4/4`);
    expect((await saved(page)).inventory).toEqual(final.inventory);
    expect(errors).toEqual([]);
  });
}

import { expect, test as base, type Page } from '@playwright/test';
import { createInitialParty } from '../../src/domain/party/factory';
import { appGame } from './canonical-app-auto-kill.support';
import { capture, isolate } from './canonical-app-battle-recovery.support';

export const test = base.extend<{ audit: void }>({
  audit: [async ({ page, context, baseURL }, use, info) => {
    const denied = await isolate(context, baseURL), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try { await use(); }
    finally {
      await capture(page, info, 'terminal-commits');
      await info.attach('browser-errors', { body: JSON.stringify({ errors, denied }), contentType: 'application/json' });
      expect(errors).toEqual([]); expect(denied).toEqual([]);
    }
  }, { auto: true }],
});
export { appGame, capture, expect };

export async function freshTown(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  const initial = await appGame(page);
  expect(initial.party).toEqual(createInitialParty(initial.party[0].id.replace(/-warrior$/, '')));
  expect(initial.inventory).toMatchObject({ gold: 35, capacity: 36 });
  expect(initial.inventory.items.map(i => i.baseId)).toEqual(['health-herb', 'mana-vial', 'town-portal']);
  expect(initial.stash.items).toEqual([]); expect(initial.quests).toEqual([]); expect(initial.mode).toBe('manual');
  expect(initial.autoThrottleMs).toBe(500); expect(initial.checkpoint.position.cell.spaceId).toBe('entry');
  await page.getByRole('button', { name: 'Portal (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  const town = await appGame(page);
  expect(town.inventory).toEqual({ ...initial.inventory, items: initial.inventory.items.filter(i => i.baseId !== 'town-portal') });
  expect(town.party).toEqual(initial.party); expect(town.quests).toEqual(initial.quests);
  expect(town.checkpoint.position).toEqual(initial.checkpoint.position); expect(town.townReturnMode).toBe('manual');
  return { initial, town };
}

export async function inventory(page: Page) {
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Characters', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
}
export const close = (page: Page) => page.getByRole('button', { name: 'Close dialog', exact: true }).click();

export async function buy(page: Page, vendor: 'Blacksmith' | 'Alchemist', name: string, price: number) {
  const before = await appGame(page);
  await page.getByRole('tab', { name: vendor, exact: true }).click();
  const row = page.locator('.town-stock-row').filter({ hasText: name });
  await row.getByRole('button', { name: `Buy ${price}g`, exact: true }).click();
  await expect.poll(async () => (await appGame(page)).inventory.gold).toBe(before.inventory.gold - price);
  return appGame(page);
}

export async function reserve(page: Page, label: 'Health' | 'Mana' | 'Portal', value: number) {
  const key = label === 'Health' ? 'healthReserve' : label === 'Mana' ? 'manaReserve' : 'portalReserve';
  const dialog = page.getByRole('dialog', { name: 'Characters', exact: true });
  const scope = await dialog.isVisible() ? dialog : page;
  const input = scope.getByLabel(`${label} reserve`, { exact: true });
  await input.fill(String(value));
  await expect.poll(async () => (await appGame(page)).inventoryPolicy?.[key]).toBe(value);
  await expect(input).toHaveValue(String(value));
}

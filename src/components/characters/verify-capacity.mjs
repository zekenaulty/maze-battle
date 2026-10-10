import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = `${root}/test-results/capacity-ui`;
const virtualId = 'virtual:capacity-check';
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CharactersDialog } from '/src/components/CharactersDialog.tsx';
import { TownScreen } from '/src/components/TownScreen.tsx';
import { createNewGameState } from '/src/domain/gameFactory.ts';
import { equipItem, unequipItem, buyVendorItem, stashItem, withdrawStashItem } from '/src/domain/items/inventory.ts';
import { createVendorItem } from '/src/domain/items/loot.ts';
import { characterFixture, itemFixture } from '/src/viewModels/characterTestFixtures.ts';
import '/src/styles.css';
const root = createRoot(document.getElementById('root'));
const noop = () => {};
let game, mode;
window.capacityActions = [];
function update(action, ...args) {
  window.capacityActions.push(args);
  game = action(game, ...args);
  draw();
}
function draw() {
  root.render(mode === 'town' ? React.createElement(TownScreen, {
    game, onLeave: noop, onRest: noop, onBuy: (_vendor, id) => update(buyVendorItem, id),
    onAcceptQuest: noop, onClaimQuest: noop, onSellJunk: noop, onCharacters: noop, onSaves: noop,
    onWithdrawStash: id => update(withdrawStashItem, id), onStashItem: id => update(stashItem, id),
  }) : React.createElement(CharactersDialog, {
    party: game.party, inventory: game.inventory, stash: game.stash,
    onClose: noop, onAutoBattleChange: noop, onUseItem: noop, onAutoEquip: noop,
    onEquipItem: (actorId, itemId) => update(equipItem, actorId, itemId),
    onUnequipItem: (actorId, slot) => update(unequipItem, actorId, slot),
    canStashItems: true, onStashItem: id => update(stashItem, id),
  }));
}
window.renderCapacity = (view, capacity = 1) => {
  const worn = itemFixture({ id: 'worn', displayName: 'Worn Sword' });
  const other = itemFixture({ id: 'other', displayName: 'Other Sword' });
  const spare = itemFixture({ id: 'spare', displayName: 'Spare Sword' });
  game = { ...createNewGameState({ mode: 'town' }),
    party: [characterFixture({ equipment: { weapon: worn.id } }), characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', equipment: { weapon: other.id } })],
    inventory: { capacity, gold: 1000, items: [worn, other, spare] },
    stash: { capacity: 1, items: [createVendorItem('health-herb')] },
  };
  mode = view;
  draw();
};
window.renderCapacity('town');
`;
await mkdir(output, { recursive: true });
const server = await createServer({
  root, cacheDir: `${output}/vite-cache`, server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'capacity-check',
    resolveId(id) { if (id === virtualId) return `\0${virtualId}`; },
    load(id) { if (id === `\0${virtualId}`) return entry; },
    configureServer(vite) {
      vite.middlewares.use('/__capacity-check', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__capacity-check', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__${virtualId}"></script></body></html>`));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__capacity-check`, { waitUntil: 'networkidle' });

  async function screenshot(name, surface) {
    const overflow = await surface.evaluate(element => [element, ...element.querySelectorAll('article, button, small, .inventory-actions, .equipment-slot, .screen-status')]
      .filter(node => node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 2)
      .map(node => node.className || node.textContent));
    assert.deepEqual(overflow, [], `Overflow in ${name}`);
    await page.screenshot({ path: `${output}/${name}.png` });
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.renderCapacity('town'));
    await expect(page.locator('.screen-status')).toContainText('Pack 1/1');
    await expect(page.getByRole('button', { name: 'Pack 1/1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pack full', exact: true })).toBeDisabled();
    await screenshot(`${viewport.width}-town`, page.getByRole('main'));
    await page.locator('.vendor-card').last().scrollIntoViewIfNeeded();
    await screenshot(`${viewport.width}-vendor`, page.getByRole('main'));
    await page.locator('.town-storage').scrollIntoViewIfNeeded();
    await screenshot(`${viewport.width}-storage`, page.getByRole('main'));
    await page.evaluate(() => window.renderCapacity('characters'));
    await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unequip Worn Sword from Vor' })).toBeDisabled();
    await expect(page.getByText('Pack full: no room to unequip', { exact: true })).toBeVisible();
    await screenshot(`${viewport.width}-equipment`, page.getByRole('dialog'));
    await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
    await expect(page.getByText(/Gold 1000 - Pack 1\/1/)).toBeVisible();
    const row = page.getByRole('article', { name: 'Other Sword', exact: true });
    await row.getByRole('button', { name: 'Move', exact: true }).scrollIntoViewIfNeeded();
    await expect(row.getByRole('button', { name: 'Move', exact: true })).toBeDisabled();
    await expect(row.getByText('Pack full: no room for displaced gear', { exact: true })).toBeVisible();
    await screenshot(`${viewport.width}-inventory`, page.getByRole('dialog'));
    const spare = page.getByRole('article', { name: 'Spare Sword', exact: true });
    await expect(spare.getByRole('button', { name: 'Stash', exact: true })).toBeDisabled();
    await spare.getByRole('button', { name: 'Equip', exact: true }).click();
    await expect(spare.getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
    await expect(page.getByText(/Gold 1000 - Pack 1\/1/)).toBeVisible();
  }
  await page.evaluate(() => window.renderCapacity('town', 2));
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('.screen-status')).toContainText('Pack 2/2 - Stash 0/1');
  await expect(page.getByRole('button', { name: 'Buy 6g', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Buy 6g', exact: true }).click();
  await expect(page.locator('.screen-status')).toContainText('Gold 994 - Pack 2/2');
  assert.deepEqual(await page.evaluate(() => window.capacityActions.slice(0, 3)), Array.from({ length: 3 }, () => ['vor', 'spare']));
  assert.deepEqual(errors, []);
  console.log(`PASS: bag counts, guarded actions, domain replacement/withdrawal/stacking, fifteen screenshots at 320/390/1280px; ${output}`);
} finally {
  await browser?.close();
  await server.close();
}

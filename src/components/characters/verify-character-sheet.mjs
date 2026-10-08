import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Bounded visual/interaction check using this worktree and an OS-assigned port.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = `${root}/test-results/character-sheet`;
await mkdir(output, { recursive: true });
const server = await createServer({ root, cacheDir: `${output}/vite-cache`, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Party', exact: true }).waitFor();
  await page.evaluate(async () => {
    const { itemFixture } = await import('/src/viewModels/characterTestFixtures.ts');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');
      request.onsuccess = () => {
        const slot = request.result;
        if (!slot) { reject(new Error('Initial autosave missing')); return; }
        const sword = itemFixture({ id: 'preview-sword', locked: true });
        const wand = itemFixture({ id: 'preview-wand', displayName: 'Oak Wand of the Patient Stargazer', rarity: 'rare', stats: { intellect: 8, baseDamage: 3 } });
        const shield = itemFixture({ id: 'preview-shield', displayName: 'Old King Buckler', slot: 'offhand', rarity: 'legendary', stats: { vitality: 3, maxHp: 5 }, legendaryPower: { id: 'old-king', name: 'Old King', description: 'A forgotten ruler still lends strength.' } });
        slot.game.mode = 'manual';
        slot.game.randomBattles = false;
        slot.game.party.forEach((actor) => { actor.equipment = {}; actor.autoBattle = false; });
        slot.game.party[0].equipment = { weapon: sword.id, offhand: shield.id };
        slot.game.party[1].equipment = { weapon: wand.id };
        slot.game.inventory.items.push(sword, wand, shield);
        store.put(slot);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: 'Party', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Characters', exact: true });
  await expect(page.getByRole('button', { name: /Vor/ })).toBeFocused();
  assert(await dialog.evaluate((element) => element.matches(':modal')));
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const view of ['Stats', 'Equipment', 'Skills', 'Inventory']) {
      await page.getByRole('tab', { name: view, exact: true }).click();
      const overflow = await page.getByRole('dialog').evaluate((dialog) => {
        const visible = (element) => !element.closest('[hidden]') && element.getBoundingClientRect().width > 0;
        return [dialog, ...dialog.querySelectorAll('.character-sheet, [role="tabpanel"], button, select, table, .inventory-item, .equipment-slot')].filter(visible).filter((element) => element.scrollWidth > element.clientWidth + 2).map((element) => `${element.tagName}.${element.className}`);
      });
      assert.deepEqual(overflow, [], `${viewport.width}x${viewport.height} ${view}: horizontal overflow`);
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-${view.toLowerCase()}.png` });
    }
    await page.getByRole('button', { name: /Zyth/ }).click();
    await page.getByRole('searchbox').fill('Iron Sword');
    assert.equal(await page.locator('.inventory-item').count(), 1);
    await page.locator('.inventory-item').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-comparison.png` });
    await page.getByRole('button', { name: 'Reset inventory filters' }).click();
    await page.getByRole('button', { name: /Vor/ }).click();
  }
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  assert.equal(await page.locator('.equipment-slot').count(), 8);
  await page.getByRole('button', { name: 'Browse weapon' }).click();
  assert.equal(await page.getByLabel('Slot', { exact: true }).inputValue(), 'weapon');
  await page.getByRole('button', { name: 'Reset inventory filters' }).click();
  await page.getByRole('button', { name: /Zyth/ }).click();
  const swordRow = page.locator('[data-item-id="preview-sword"]');
  await swordRow.getByRole('button', { name: 'Move', exact: true }).click();
  assert.match(await swordRow.textContent(), /Equipped: Zyth - weapon/);
  await page.getByRole('button', { name: /Ayla/ }).click();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport);
    for (const name of ['Heal', 'Group Heal', 'Resurrect']) {
      const cast = page.getByRole('button', { name: `Cast ${name}`, exact: true });
      assert(await cast.isDisabled());
      assert.equal(await cast.getAttribute('title'), 'Casting unavailable');
    }
    const overflow = await page.locator('.character-skill').evaluateAll((cards) => cards.some((card) => card.scrollWidth > card.clientWidth + 2));
    assert.equal(overflow, false);
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-casting.png` });
  }
  await page.getByRole('button', { name: 'Close dialog' }).focus();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 16; index++) {
      await page.keyboard.press(key);
      assert(await dialog.evaluate((element) => element.contains(document.activeElement)), `${key} escaped native modal`);
    }
  }
  await dialog.evaluate((element) => {
    window.characterCancelCount = 0;
    element.addEventListener('cancel', () => { window.characterCancelCount++; });
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  assert.equal(await page.evaluate(() => window.characterCancelCount), 1);
  await trigger.click();
  await expect(page.getByRole('button', { name: /Vor/ })).toBeFocused();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  assert.deepEqual(errors, []);
  console.log(`PASS: 22 screenshots, four viewports, all eight slots, search/reset, actor transfer, disabled cast reasons, native autofocus/Tab containment/cancel/restore/reopen; ${output}`);
} finally {
  await browser?.close();
  await server.close();
}

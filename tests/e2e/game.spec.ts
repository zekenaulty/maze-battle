import { expect, test, type Page } from '@playwright/test';
import type { SaveSlot } from '../../src/domain/types';

test('renders explore and battle as separate full screens', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });

  await expect(page.locator('.explore-screen')).toBeVisible();
  await expect(page.locator('.battle-screen')).toHaveCount(0);
  await expect(page.locator('.explore-screen .vital-bar')).toHaveCount(0);
  await expect(page.locator('.dpad')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.locator('.dpad')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.dpad')).toBeHidden();

  await expect(page.getByLabel('Maze texture')).toHaveCount(0);

  await page.getByRole('button', { name: 'Expedition settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Expedition settings' });
  await settings.getByRole('checkbox', { name: 'Encounters' }).uncheck();
  await expect(settings.getByRole('checkbox', { name: 'Encounters' })).not.toBeChecked();
  await settings.getByRole('button', { name: 'Close dialog' }).click();

  const positionText = async () => (await page.locator('.screen-status').textContent())?.match(/(\d+), (\d+)$/)?.[0];
  const beforeMove = await positionText();
  expect(beforeMove).toBeTruthy();
  let afterMove = beforeMove;
  for (const key of ['w', 'd', 's', 'a', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    afterMove = await positionText();
    if (afterMove !== beforeMove) {
      break;
    }
  }
  expect(afterMove).not.toBe(beforeMove);

  const canvasDrawn = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const context = canvas.getContext('2d');
    if (!context) return false;

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < data.length; index += 4000) {
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`);
    }
    return colors.size > 2;
  });
  expect(canvasDrawn).toBe(true);

  const texturedCanvas = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const context = canvas.getContext('2d');
    if (!context) return false;

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < data.length; index += 64) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      if (red + green + blue < 80) {
        continue;
      }

      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
      if (colors.size > 24) return true;
    }
    return false;
  });
  expect(texturedCanvas).toBe(true);

  // Hold automated combat while checking layout, then advance the clock after stopping it.
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-08T12:00:01Z'));
  await page.getByRole('button', { name: 'Waves', exact: true }).click();

  await expect(page.locator('.battle-screen')).toBeVisible();
  await expect(page.locator('.explore-screen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Auto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stop Waves', exact: true })).toHaveClass(/is-active/);
  await expect(page.locator('.enemy-card')).not.toHaveCount(0);
  const enemyBox = await page.locator('.enemy-card').first().boundingBox();
  expect(enemyBox?.width).toBe(128);
  expect(enemyBox?.height).toBe(128);
  await expect(page.locator('.vital-bar')).not.toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.battle-character')).toHaveCount(3);
  await expect(page.locator('.battle-log')).toHaveCount(0);

  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Waves', exact: true })).toHaveAttribute('aria-pressed', 'false');
  for (const checkbox of await page.locator('.battle-character input[type="checkbox"]').all()) {
    await expect(checkbox).not.toBeChecked();
  }
  const stoppedStatus = await page.locator('.screen-status').textContent();
  const skillButton = page.locator('.battle-character-skills button').first();
  const beforeSkillBox = await skillButton.boundingBox();
  await page.clock.runFor(2500);
  await expect(page.locator('.screen-status')).toHaveText(stoppedStatus!);
  const afterSkillBox = await skillButton.boundingBox();
  expect(afterSkillBox?.width).toBe(beforeSkillBox?.width);
  expect(afterSkillBox?.height).toBe(beforeSkillBox?.height);
  expect(afterSkillBox?.height).toBe(48);

  await page.setViewportSize({ width: 390, height: 780 });
  const mobileBattlefieldBox = await page.locator('.battlefield').boundingBox();
  const mobileEnemyBox = await page.locator('.enemy-card').first().boundingBox();
  expect(mobileBattlefieldBox?.height).toBeGreaterThan(128);
  expect(mobileEnemyBox?.width).toBe(128);
  expect(mobileEnemyBox?.height).toBe(128);
  await expect(page.locator('.battle-character:visible')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Battle party members' }).getByRole('button', { name: /Zyth/ }).click();
  await expect(page.locator('.battle-character:visible')).toHaveAttribute('aria-label', 'Zyth');
  await expect(page.getByRole('button', { name: 'Magic Missiles', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Log', exact: true }).click();
  await expect(page.locator('.battle-character:visible')).toHaveAttribute('aria-label', 'Zyth');
  await expect(page.locator('.battle-character-vitals:visible')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  await expect(page.locator('.battle-character:visible')).toHaveAttribute('aria-label', 'Zyth');
  await page.setViewportSize({ width: 1280, height: 720 });

  const tokens = await page.locator('.enemy-card strong').allTextContents();
  expect(tokens.some((token) => /[^\x00-\x7F]/.test(token))).toBe(true);

  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.battle-log')).toBeVisible();
  await expect(page.locator('.battle-character:visible')).toHaveCount(3);
  await expect(page.locator('.battle-character-vitals:visible')).toHaveCount(3);
  await expect(page.locator('.battle-character-skills')).toHaveCount(0);
  await expect(page.locator('.battle-log li')).not.toHaveCount(0);
});

test('resolves a won battle back to exploration', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.explore-screen')).toBeVisible();

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');

      request.onsuccess = () => {
        const slot = request.result;
        slot.game.mode = 'battle';
        slot.game.party = slot.game.party.map((actor: { autoBattle: boolean }) => ({ ...actor, autoBattle: false }));
        slot.game.battle = {
          id: 'e2e-one-hit',
          wave: 1,
          status: 'active',
          round: 1,
          log: ['Battle begins.'],
          enemies: [
            {
              id: 'enemy-e2e',
              displayName: 'Test Slime',
              token: '🧪',
              level: 1,
              hp: 1,
              maxHp: 1,
              mp: 0,
              maxMp: 0,
              attributes: { strength: 1, vitality: 1, intellect: 0, available: 0 },
              combat: { baseDamage: 1, scaleWith: 'strength' },
              skills: [{ id: 'attack', cooldown: 0 }],
            },
          ],
        };
        store.put(slot);
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.battle-screen')).toBeVisible();
  await expect(page.locator('.enemy-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Slash' }).click();

  await expect(page.locator('.explore-screen')).toBeVisible();
  await expect(page.locator('.battle-screen')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toHaveCount(0);
});

test('floor one start stairs return to town instead of triggering a battle', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');

      request.onsuccess = () => {
        const slot = request.result;
        const maze = {
          rows: 1,
          columns: 3,
          start: { row: 0, column: 0 },
          end: { row: 0, column: 2 },
          active: { row: 0, column: 1 },
          visited: [
            { row: 0, column: 0 },
            { row: 0, column: 1 },
          ],
          cells: [
            { row: 0, column: 0, links: ['east'] },
            { row: 0, column: 1, links: ['west', 'east'] },
            { row: 0, column: 2, links: ['west'] },
          ],
        };
        slot.game.mode = 'manual';
        slot.game.dungeonLevel = 1;
        slot.game.randomBattles = true;
        slot.game.maze = maze;
        slot.game.floors = [{ level: 1, mazeMaxRooms: slot.game.mazeMaxRooms, maze }];
        slot.game.battle = undefined;
        store.put(slot);
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.explore-screen')).toBeVisible();

  await page.keyboard.press('ArrowLeft');

  await expect(page.locator('.town-screen')).toBeVisible();
  await expect(page.locator('.battle-screen')).toHaveCount(0);
});

test('sells inventory items from town', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');

      request.onsuccess = () => {
        const slot = request.result;
        const item = {
          id: 'sell-e2e-sword',
          baseId: 'iron-sword',
          displayName: 'Odd Sword',
          token: '!',
          category: 'equipment',
          rarity: 'magic',
          itemLevel: 2,
          value: 101,
          slot: 'weapon',
          stats: { baseDamage: 5 },
        };
        slot.game.mode = 'town';
        slot.game.inventory = { capacity: 10, gold: 5, items: [item] };
        slot.game.party[0].equipment.weapon = item.id;
        store.put(slot);
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.town-screen')).toBeVisible();
  await expect(page.locator('.guild-card')).toContainText('Guild Hall');
  await expect(page.locator('.guild-card')).toContainText('Locate Descent Gate');
  await page.getByLabel('Town actions').getByRole('button', { name: 'Party' }).click();
  const characters = page.getByRole('dialog', { name: 'Characters' });
  await characters.getByRole('tab', { name: 'Inventory', exact: true }).click();

  const sword = page.locator('.inventory-item').filter({ hasText: 'Odd Sword' });
  await expect(sword).toBeVisible();
  await expect(sword.getByText('Equipped: Vor - weapon')).toBeVisible();
  await expect(sword.getByRole('button', { name: 'Sell 51g', exact: true })).toBeDisabled();
  await characters.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await characters.getByRole('button', { name: 'Unequip Odd Sword from Vor', exact: true }).click();
  await expect(characters.locator('.equipment-slot').filter({ has: page.getByRole('button', { name: 'Browse weapon', exact: true }) })).toContainText('empty');
  await characters.getByRole('tab', { name: 'Inventory', exact: true }).click();
  await expect(sword.getByText('Equipped: Vor - weapon')).toHaveCount(0);
  await expect(sword.getByRole('button', { name: 'Sell 51g', exact: true })).toBeEnabled();
  await sword.getByRole('button', { name: 'Sell 51g' }).click();

  await expect(page.locator('.inventory-panel')).toContainText('Gold 56');
  await expect(page.locator('.inventory-panel')).toContainText('Pack 0/10');
  await expect(page.locator('.inventory-item').filter({ hasText: 'Odd Sword' })).toHaveCount(0);
  await characters.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await expect(characters.locator('.equipment-slot').filter({ has: page.getByRole('button', { name: 'Browse weapon', exact: true }) })).toContainText('empty');
});

test('stacks consumables and auto equips scored gear', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');

      request.onsuccess = () => {
        const slot = request.result;
        const herb = {
          baseId: 'health-herb',
          displayName: 'Health Herb',
          token: '!',
          category: 'consumable',
          rarity: 'common',
          itemLevel: 1,
          value: 8,
          consumableEffect: 'heal',
          consumableAmount: 35,
        };
        slot.game.mode = 'manual';
        slot.game.inventory = {
          capacity: 10,
          gold: 0,
          items: [
            { ...herb, id: 'herb-a' },
            { ...herb, id: 'herb-b' },
            {
              id: 'auto-sword',
              baseId: 'iron-sword',
              displayName: 'Iron Sword',
              token: '!',
              category: 'equipment',
              rarity: 'common',
              itemLevel: 2,
              value: 30,
              slot: 'weapon',
              stats: { baseDamage: 4, strength: 1 },
            },
            {
              id: 'auto-wand',
              baseId: 'oak-wand',
              displayName: 'Oak Wand',
              token: '!',
              category: 'equipment',
              rarity: 'common',
              itemLevel: 2,
              value: 18,
              slot: 'weapon',
              stats: { baseDamage: 1, intellect: 1 },
            },
          ],
        };
        slot.game.party = slot.game.party.map((actor: { equipment: Record<string, string> }) => ({ ...actor, equipment: {} }));
        store.put(slot);
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Party' }).click();
  const characters = page.getByRole('dialog', { name: 'Characters' });
  await characters.getByRole('tab', { name: 'Inventory', exact: true }).click();

  const herb = page.locator('.inventory-item').filter({ hasText: 'Health Herb x2' });
  await expect(herb).toBeVisible();
  await expect(herb).toContainText('Stack 2');
  await expect(page.locator('.inventory-item').filter({ hasText: 'Iron Sword' })).toContainText('GS');

  await page.getByRole('button', { name: 'Auto Equip' }).click();

  await expect(page.locator('[data-item-id="auto-sword"]')).toContainText('Equipped: Vor - weapon');
  await expect(page.locator('[data-item-id="auto-wand"]')).toContainText('Equipped: Zyth - weapon');
  await characters.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await expect(characters.getByRole('button', { name: 'Unequip Iron Sword from Vor', exact: true })).toBeVisible();
  await characters.getByRole('group', { name: 'Character selection' }).getByRole('button', { name: /Zyth/ }).click();
  await expect(characters.getByRole('button', { name: 'Unequip Oak Wand from Zyth', exact: true })).toBeVisible();
  await characters.getByRole('group', { name: 'Character selection' }).getByRole('button', { name: /Vor/ }).click();
  await characters.getByRole('tab', { name: 'Stats', exact: true }).click();
  const stats = characters.getByRole('table', { name: 'Vor base and effective stats' });
  await expect(stats.getByRole('columnheader', { name: 'Gear', exact: true })).toBeVisible();
  await expect(stats.getByRole('row', { name: /^Strength / }).getByRole('cell').nth(1)).toHaveText('+1');
});

test('shows item stat effects and equipped owner in the character sheet', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const store = transaction.objectStore('saves');
      const request = store.get('auto');

      request.onsuccess = () => {
        const slot = request.result;
        const item = {
          id: 'legendary-buckler-e2e',
          baseId: 'buckler',
          displayName: 'Legendary Buckler',
          token: '[]',
          category: 'equipment',
          rarity: 'legendary',
          itemLevel: 6,
          value: 100,
          slot: 'offhand',
          stats: { vitality: 3, maxHp: 5 },
          affixes: [
            { id: 'edge', name: 'Edge', stats: { baseDamage: 2 } },
            { id: 'guarding', name: 'Guarding', stats: { maxHp: 8 } },
            { id: 'wolf', name: 'Wolf', stats: { strength: 2, baseDamage: 1 } },
            { id: 'bear', name: 'Bear', stats: { vitality: 2, maxHp: 4 } },
          ],
          legendaryPower: { id: 'old-king', name: 'Old King', description: 'A forgotten ruler still lends strength.' },
        };
        slot.game.inventory.items.push(item);
        slot.game.party[0].equipment.offhand = item.id;
        store.put(slot);
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Party' }).click();
  await page.getByRole('dialog', { name: 'Characters' }).getByRole('tab', { name: 'Inventory', exact: true }).click();

  const buckler = page.locator('.inventory-item').filter({ hasText: 'Legendary Buckler' });
  await expect(buckler).toBeVisible();
  await expect(buckler.getByText('Equipped: Vor - offhand')).toBeVisible();
  await expect(buckler.getByText('+3 Damage')).toBeVisible();
  await expect(buckler.getByText('+4 Strength')).toBeVisible();
  await expect(buckler.getByText('+6 Vitality')).toBeVisible();
  await expect(buckler.getByText('+17 Max HP')).toBeVisible();
  await expect(buckler.getByText('Old King: +2 Strength, +1 Vitality. A forgotten ruler still lends strength.')).toBeVisible();
  await expect(buckler.getByRole('button', { name: /Sell/ })).toHaveCount(0);
});

test('confirms save loading, deletion and new game without changing state on cancellation', async ({ page }) => {
  await page.goto('/');
  await clearDatabase(page);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.explore-screen')).toBeVisible();
  const original = (await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game;

  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  const saves = page.getByRole('dialog', { name: 'Saves', exact: true });
  await saves.getByRole('button', { name: 'New save', exact: true }).click();
  const manualRow = saves.locator('.save-row').filter({ hasText: /manual/i });
  await expect(manualRow).toHaveCount(1);
  await expect(manualRow.locator('time')).toBeVisible();
  await expect(manualRow).toContainText('Warrior 1 - Mage 1 - Healer 1');
  const manual = (await readSaveSlots(page)).find((slot) => slot.kind === 'manual')!;
  expect(manual.game.id).toBe(original.id);
  await saves.getByRole('button', { name: 'Close dialog' }).click();

  const beginNewGame = async () => {
    await page.getByRole('button', { name: 'Expedition settings' }).click();
    await page.getByRole('dialog', { name: 'Expedition settings' }).getByRole('button', { name: 'New game', exact: true }).click();
    return page.getByRole('dialog', { name: 'Start a new game?', exact: true });
  };
  let confirmation = await beginNewGame();
  await expect(confirmation).toContainText('Manual saves are kept.');
  expect((await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).toBe(original.id);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).toBe(original.id);
  confirmation = await beginNewGame();
  await confirmation.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect.poll(async () => (await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).not.toBe(original.id);
  const replacementId = (await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id;

  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(manualRow).toHaveCount(1);
  await manualRow.getByRole('button', { name: 'Load', exact: true }).click();
  const load = page.getByRole('dialog', { name: 'Load save?', exact: true });
  await expect(load).toContainText('replaces the current expedition and autosave');
  await load.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).toBe(replacementId);
  await manualRow.getByRole('button', { name: 'Load', exact: true }).click();
  await load.getByRole('button', { name: 'Load save', exact: true }).click();
  await expect(saves).toHaveCount(0);
  await expect.poll(async () => (await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).toBe(original.id);

  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await manualRow.getByRole('button', { name: 'Delete', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Delete save?', exact: true });
  await expect(remove).toContainText('This cannot be undone.');
  await remove.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(manualRow).toHaveCount(1);
  expect((await readSaveSlots(page)).some((slot) => slot.slotId === manual.slotId)).toBe(true);
  await manualRow.getByRole('button', { name: 'Delete', exact: true }).click();
  await remove.getByRole('button', { name: 'Delete save', exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(manualRow).toHaveCount(0);
  expect((await readSaveSlots(page)).some((slot) => slot.slotId === manual.slotId)).toBe(false);
  expect((await readSaveSlots(page)).find((slot) => slot.slotId === 'auto')!.game.id).toBe(original.id);
  await saves.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(manualRow).toHaveCount(0);
});

async function clearDatabase(page: Page) {
  await expect(page.locator('.explore-screen')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // App keeps an IDB connection open; deleteDatabase.onblocked is not a successful reset.
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['saves', 'meta'], 'readwrite');
        transaction.objectStore('saves').clear();
        transaction.objectStore('meta').clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Save reset aborted'));
      });
    } finally { db.close(); }
  });
}

async function readSaveSlots(page: Page): Promise<SaveSlot[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<SaveSlot[]>((resolve, reject) => {
        const request = db.transaction('saves', 'readonly').objectStore('saves').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

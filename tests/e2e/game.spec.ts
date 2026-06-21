import { expect, test } from '@playwright/test';

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

  if (await page.locator('.compact-toggle input').isChecked()) {
    await page.locator('.compact-toggle').click();
  }

  const beforeMove = await page.locator('.screen-status').textContent();
  let afterMove = beforeMove;
  for (const key of ['w', 'd', 's', 'a', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    afterMove = await page.locator('.screen-status').textContent();
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

    const width = Math.min(160, canvas.width);
    const height = Math.min(100, canvas.height);
    const data = context.getImageData(Math.floor(canvas.width / 2 - width / 2), Math.floor(canvas.height / 2 - height / 2), width, height).data;
    const colors = new Set<string>();
    for (let index = 0; index < data.length; index += 16) {
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
      if (colors.size > 24) return true;
    }
    return false;
  });
  expect(texturedCanvas).toBe(true);

  await page.getByRole('button', { name: 'Waves' }).click();

  await expect(page.locator('.battle-screen')).toBeVisible();
  await expect(page.locator('.explore-screen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Auto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Waves' })).toHaveClass(/is-active/);
  await expect(page.locator('.enemy-card')).not.toHaveCount(0);
  const enemyBox = await page.locator('.enemy-card').first().boundingBox();
  expect(enemyBox?.width).toBe(128);
  expect(enemyBox?.height).toBe(128);
  await expect(page.locator('.vital-bar')).not.toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.battle-character')).toHaveCount(3);
  await expect(page.locator('.battle-log')).toHaveCount(0);

  await page.getByRole('button', { name: 'Auto' }).click();
  const skillButton = page.locator('.battle-character-skills button').first();
  const beforeSkillBox = await skillButton.boundingBox();
  await page.waitForTimeout(400);
  const afterSkillBox = await skillButton.boundingBox();
  expect(afterSkillBox?.width).toBe(beforeSkillBox?.width);
  expect(afterSkillBox?.height).toBe(beforeSkillBox?.height);
  expect(afterSkillBox?.height).toBe(34);

  await page.setViewportSize({ width: 390, height: 780 });
  const mobileBattlefieldBox = await page.locator('.battlefield').boundingBox();
  const mobileEnemyBox = await page.locator('.enemy-card').first().boundingBox();
  expect(mobileBattlefieldBox?.height).toBeGreaterThan(128);
  expect(mobileEnemyBox?.width).toBe(128);
  expect(mobileEnemyBox?.height).toBe(128);
  await page.setViewportSize({ width: 1280, height: 720 });

  const tokens = await page.locator('.enemy-card strong').allTextContents();
  expect(tokens.some((token) => /[^\x00-\x7F]/.test(token))).toBe(true);

  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.battle-log')).toBeVisible();
  await expect(page.locator('.battle-character')).toHaveCount(0);
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
  await page.getByLabel('Town actions').getByRole('button', { name: 'Party' }).click();

  const sword = page.locator('.inventory-item').filter({ hasText: 'Odd Sword' });
  await expect(sword).toBeVisible();
  await expect(sword.getByText('Equipped: Vor - weapon')).toBeVisible();
  await sword.getByRole('button', { name: 'Sell 51g' }).click();

  await expect(page.locator('.inventory-panel')).toContainText('Gold 56');
  await expect(page.locator('.inventory-panel')).toContainText('Pack 0/10');
  await expect(page.locator('.inventory-item').filter({ hasText: 'Odd Sword' })).toHaveCount(0);
  await expect(page.locator('.equipment-slot').filter({ hasText: 'weapon' }).first()).toContainText('empty');
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

  const herb = page.locator('.inventory-item').filter({ hasText: 'Health Herb x2' });
  await expect(herb).toBeVisible();
  await expect(herb).toContainText('Stack 2');
  await expect(page.locator('.inventory-item').filter({ hasText: 'Iron Sword' })).toContainText('GS');

  await page.getByRole('button', { name: 'Auto Equip' }).click();

  await expect(page.locator('.character-card').filter({ hasText: 'Vor' })).toContainText('Iron Sword');
  await expect(page.locator('.character-card').filter({ hasText: 'Zyth' })).toContainText('Oak Wand');
  await expect(page.locator('.character-card').filter({ hasText: 'Vor' })).toContainText('Gear');
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

async function clearDatabase(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const request = indexedDB.deleteDatabase('maze-battle');
    await new Promise((resolve, reject) => {
      request.onsuccess = resolve;
      request.onerror = reject;
      request.onblocked = resolve;
    });
  });
}

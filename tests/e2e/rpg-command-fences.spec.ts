import { test, expect, seed, fixture } from './rpg-command-browser';

for (const condition of ['takeover', 'revision', 'replacement', 'expired'] as const) {
  test(`${condition} fences the original command without running a newly authorized effect`, async ({ page }) => {
    const request = await seed(page);
    const result = await page.evaluate(async ({ request, condition }) => {
      const h = window.rpgCommandTest;
      if (condition === 'takeover') await h.custody.claimGame('other', true);
      if (condition === 'revision') await h.custody.updateOwnedGame(request.control, g => ({ ...g, facing: 'north' }));
      if (condition === 'replacement') await h.custody.updateOwnedGame(request.control, () => ({ ...h.game(), id: 'replacement' }));
      if (condition === 'expired') request.deadlineAt = 0;
      const before = await h.custody.readGameControl();
      const receipt = await h.commands.executeOwnedGameCommand(request);
      return { before, receipt, after: await h.custody.readGameControl() };
    }, { request, condition });
    expect(result.receipt.receipt.outcome).toEqual({ status: 'not-applied', reason: condition === 'expired' ? 'expired' : 'conflict' });
    expect(result.after).toEqual(result.before);
  });
}

for (const store of ['saves', 'meta', 'gameCommands', 'observations'] as const) {
  test(`${store} failure rolls back the game, fence, and command receipt together`, async ({ page }) => {
    const request = await seed(page);
    const result = await page.evaluate(async ({ request, store }) => {
      const h = window.rpgCommandTest, before = await h.custody.readGameControl();
      const method = store === 'gameCommands' || store === 'observations' ? 'add' : 'put', original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) {
        if (this.name === store) throw new DOMException('Injected quota', 'QuotaExceededError');
        return original.apply(this, args);
      };
      let error = '';
      try { await h.commands.executeOwnedGameCommand(request); } catch (failure) { error = String(failure); }
      finally { IDBObjectStore.prototype[method] = original; }
      const after = await h.custody.readGameControl(), missing = await h.commands.readGameCommand(request);
      const settled = await h.commands.settleGameCommand(request);
      return { before, after, error, missing, settled, late: await h.commands.executeOwnedGameCommand(request) };
    }, { request, store });
    expect(result.error).toContain('QuotaExceededError');
    expect(result.after).toEqual(result.before);
    expect(result.missing).toBeUndefined();
    expect(result.settled.receipt.outcome).toEqual({ status: 'not-applied', reason: 'settled' });
    expect(result.late.receipt).toEqual(result.settled.receipt);
  });
}

test('corrupt committed receipt is not treated as permission to rerun the effect', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, first = await h.commands.executeOwnedGameCommand(request);
    const db = await h.repository.getDatabase();
    await db.put('gameCommands', { ...first.receipt, afterRevision: -1 });
    const errors: string[] = [];
    for (const work of [h.commands.readGameCommand, h.commands.settleGameCommand, h.commands.executeOwnedGameCommand]) {
      try { await work(request); } catch (error) { errors.push(String(error)); }
    }
    return { first, errors, after: await h.custody.readGameControl() };
  }, request);
  expect(result.errors).toHaveLength(3);
  expect(result.errors.every(e => e.includes('Invalid game command or receipt'))).toBe(true);
  expect(result.after).toEqual(result.first.current);
});

for (const version of [2, 3, 4, 5]) test(`upgrading a v${version} native database adds history without rewriting old save contents`, async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async version => {
    const h = window.rpgCommandTest, game = h.game();
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle', version);
      request.onupgradeneeded = () => {
        const db = request.result, saves = db.createObjectStore('saves', { keyPath: 'slotId' });
        saves.createIndex('byUpdatedAt', 'updatedAt'); saves.createIndex('byKind', 'kind');
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('telemetry', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
        if (version >= 3) db.createObjectStore('gameCommands', { keyPath: 'attemptId' }).createIndex('byGameId', 'gameId');
        if (version >= 4) db.createObjectStore('observations', { keyPath: 'id' }).createIndex('byGameId', 'gameId');
        if (version >= 5) { db.createObjectStore('rpgMemoryNodes', { keyPath: 'id' }); db.createObjectStore('rpgMemoryHeads', { keyPath: 'id' }); }
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const slot = { slotId: 'old-manual', label: 'Keep exact', kind: 'manual' as const,
      createdAt: game.createdAt, updatedAt: game.updatedAt, game };
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction('saves', 'readwrite'); tx.objectStore('saves').put(slot);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    old.close();
    const db = await h.repository.getDatabase();
    return { slot, stored: await db.get('saves', slot.slotId), version: db.version,
      receipts: await db.count('gameCommands'), stores: [...db.objectStoreNames] };
  }, version);
  expect(result.version).toBe(6);
  expect(result.stored).toEqual(result.slot);
  expect(result.receipts).toBe(0);
  expect(result.stores).toContain('gameCommands');
  expect(result.stores).toContain('observations');
  expect(result.stores).toContain('rpgMemoryNodes');
  expect(result.stores).toContain('rpgMemoryHeads');
  expect(result.stores).toContain('rpgTravels');
  expect(result.stores).toContain('rpgTravelActions');
});

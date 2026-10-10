import { test, expect } from '@playwright/test';
import fresh from '../fixtures/original-saves/fresh.json' with { type: 'json' };
import advanced from '../fixtures/original-saves/advanced.json' with { type: 'json' };
import { produceOriginalFixtures } from './original-producer.mjs';
import { installInterruption, openImporter, readStores, runImport, seedOriginal } from './original-import-browser';

test('fixtures reproduce the actual tagged JavaScript saveState and import through real stores', async ({ page, context }) => {
  const producer = await context.newPage();
  const actual = await produceOriginalFixtures(producer);
  expect(actual).toEqual({ fresh, advanced });
  await producer.close();
  // The producer used this disposable context's localStorage; isolate the import inputs explicitly.
  await openImporter(page);
  await page.evaluate(() => localStorage.clear());
  await seedOriginal(page, { Fresh: actual.fresh.state, Advanced: actual.advanced.state });
  expect(await runImport(page)).toEqual({ imported: 2, warnings: [] });
  const state = await readStores(page);
  expect(state.storage).toEqual({});
  expect(state.saves).toHaveLength(2);
  expect(state.markers.every((marker) => marker.phase === 'cleaned')).toBe(true);
  const saved = state.saves.find((slot) => slot.label === 'Advanced')!.game;
  actual.advanced.expected.forEach((actor, i) => expect(saved.party[i]).toMatchObject(actor));
  expect(saved.inventory.gold).toBe(137);
  expect(saved.maze.active).toEqual(actual.advanced.state.maze.active);
  expect(saved.maze.cells).toHaveLength(36);
  expect(await runImport(page)).toEqual({ imported: 0, warnings: [] });
});

test('isolates invalid sources, ignores a stale flag, and leaves modern loading/new-game available', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { broken: '{invalid', Advanced: advanced.state, malformed: { ...fresh.state, maze: null } });
  const modern = await page.evaluate(async () => {
    const { getDatabase } = await import('/src/persistence/saveRepository.ts');
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    const db = await getDatabase();
    const game = createNewGameState();
    game.inventory.gold = 812;
    await db.put('saves', { slotId: 'auto', label: 'Modern', kind: 'auto', game, createdAt: game.createdAt, updatedAt: game.updatedAt });
    await db.put('meta', { key: 'legacy-local-storage-imported', value: 'true' });
    return game;
  });
  const result = await runImport(page);
  expect(result.imported).toBe(1);
  expect(result.warnings).toHaveLength(2);
  const state = await readStores(page);
  expect(state.storage['DC-GAME-BROKEN']).toBe('{invalid');
  expect(state.storage['DC-GAME-MALFORMED']).toBeDefined();
  expect(JSON.parse(state.storage['DC-GAME-SAVE-SLOTS']!)).toEqual(['broken', 'malformed']);
  expect(state.saves.find((slot) => slot.slotId === 'auto')!.game).toEqual(modern);
  expect(await page.evaluate(async () => {
    const { getGame } = await import('/src/persistence/saveRepository.ts');
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    return { gold: (await getGame('auto')).game.inventory.gold, party: createNewGameState().party.length };
  })).toEqual({ gold: 812, party: 3 });
});

test('exact keys and content hashes distinguish colliding labels and preserve modern destinations', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { 'A B': fresh.state, 'A-B': fresh.state, '<b>A B</b>': advanced.state });
  await page.evaluate(async () => {
    const { getDatabase } = await import('/src/persistence/saveRepository.ts');
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    const db = await getDatabase();
    const game = createNewGameState();
    game.inventory.gold = 999;
    await db.put('saves', { slotId: 'legacy-a-b', label: 'Existing', kind: 'manual', game, createdAt: game.createdAt, updatedAt: game.updatedAt });
  });
  expect(await runImport(page)).toEqual({ imported: 3, warnings: [] });
  const state = await readStores(page);
  expect(state.saves).toHaveLength(4);
  expect(new Set(state.saves.map((slot) => slot.slotId)).size).toBe(4);
  expect(state.saves.find((slot) => slot.slotId === 'legacy-a-b')!.game.inventory.gold).toBe(999);
  expect(new Set(state.markers.map((marker) => marker.sourceKey))).toEqual(new Set(['DC-GAME-A B', 'DC-GAME-A-B', 'DC-GAME-<B>A B</B>']));
  expect(state.storage).toEqual({});
});

test('an existing exact destination is never overwritten or consumed', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { Advanced: advanced.state });
  const before = await page.evaluate(async () => {
    const { originalHash } = await import('/src/persistence/originalImportStore.ts');
    const { getDatabase } = await import('/src/persistence/saveRepository.ts');
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    const key = 'DC-GAME-ADVANCED';
    const slotId = `legacy-${await originalHash([key, await originalHash(localStorage.getItem(key))])}`;
    const game = createNewGameState();
    game.inventory.gold = 777;
    const slot = { slotId, label: 'Existing', kind: 'manual', game, createdAt: game.createdAt, updatedAt: game.updatedAt };
    await (await getDatabase()).put('saves', slot);
    return slot;
  });
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('already exists')] });
  const state = await readStores(page);
  expect(state.saves).toEqual([before]);
  expect(state.markers).toEqual([]);
  expect(state.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
});

for (const phase of ['before-commit', 'abort-commit', 'after-commit', 'abort-verification', 'after-verification', 'after-source-deletion', 'after-index-cleanup']) {
  test(`restart recovers ${phase} without re-crediting or overwriting`, async ({ page }) => {
    await openImporter(page);
    await seedOriginal(page, { Advanced: advanced.state });
    await installInterruption(page, phase);
    const failed = await runImport(page);
    expect(failed.imported).toBe(0);
    expect(failed.warnings).toHaveLength(1);
    const before = await readStores(page);
    const committed = !['before-commit', 'abort-commit'].includes(phase);
    const verified = committed && !['after-commit', 'abort-verification'].includes(phase);
    expect(before.saves).toHaveLength(committed ? 1 : 0);
    expect(before.markers).toHaveLength(committed ? 1 : 0);
    if (committed) expect(before.markers[0].phase).toBe(verified ? 'verified' : 'committed');
    if (!['after-source-deletion', 'after-index-cleanup'].includes(phase)) {
      expect(before.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
    } else expect(before.storage['DC-GAME-ADVANCED']).toBeUndefined();
    if (phase === 'after-index-cleanup') expect(before.storage).toEqual({});
    await page.reload();
    if (verified) {
      await page.evaluate(async () => {
        const db = await (await import('/src/persistence/saveRepository.ts')).getDatabase();
        const [slot] = await db.getAll('saves');
        slot.game.inventory.gold = 913;
        slot.game.party[0].xp += 27;
        await db.put('saves', slot);
      });
    }
    expect(await runImport(page)).toEqual({ imported: 1, warnings: [] });
    const after = await readStores(page);
    expect(after.saves).toHaveLength(1);
    expect(after.saves[0].game.inventory.gold).toBe(verified ? 913 : 137);
    expect(after.saves[0].game.party[0].xp).toBe(advanced.state.warrior.xp + (verified ? 27 : 0));
    if (committed) expect(after.saves[0].slotId).toBe(before.saves[0].slotId);
    expect(after.markers[0].phase).toBe('cleaned');
    expect(after.storage).toEqual({});
    expect(await runImport(page)).toEqual({ imported: 0, warnings: [] });
    expect((await readStores(page)).saves).toEqual(after.saves);
  });
}

test('readback corruption retains the original and does not mark verification or overwrite on restart', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { Advanced: advanced.state });
  await installInterruption(page, 'corrupt-readback');
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('verification failed')] });
  const before = await readStores(page);
  expect(before.markers[0].phase).toBe('committed');
  expect(before.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
  await page.reload();
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('verification failed')] });
  expect(await readStores(page)).toEqual(before);
});

test('a closed tab after commit resumes readback verification and cleanup in a fresh page', async ({ page, context }) => {
  await openImporter(page);
  await seedOriginal(page, { Advanced: advanced.state });
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let payloads = 0;
    crypto.subtle.digest = async (algorithm, data) => {
      if (new TextDecoder().decode(data).startsWith('{"slotId":') && ++payloads === 2) {
        (window as any).readbackPaused = true;
        return new Promise<ArrayBuffer>(() => {});
      }
      return digest(algorithm, data);
    };
  });
  const interrupted = runImport(page).catch(() => undefined);
  await page.waitForFunction(() => (window as any).readbackPaused === true);
  const before = await readStores(page);
  expect(before.saves).toHaveLength(1);
  expect(before.markers[0].phase).toBe('committed');
  expect(before.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
  await page.close();
  await interrupted;
  const resumed = await context.newPage();
  await openImporter(resumed);
  expect(await runImport(resumed)).toEqual({ imported: 1, warnings: [] });
  const after = await readStores(resumed);
  expect(after.saves).toEqual(before.saves);
  expect(after.storage).toEqual({});
  expect(after.markers[0].phase).toBe('cleaned');
});

test('destination changes while readback hashing cannot be acknowledged as verified', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { Advanced: advanced.state });
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let payloads = 0;
    crypto.subtle.digest = async (algorithm, data) => {
      if (new TextDecoder().decode(data).startsWith('{"slotId":') && ++payloads === 2) {
        const db = await (await import('/src/persistence/saveRepository.ts')).getDatabase();
        const [slot] = await db.getAll('saves');
        slot.game.inventory.gold = 456;
        await db.put('saves', slot);
      }
      return digest(algorithm, data);
    };
  });
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('changed during verification')] });
  const state = await readStores(page);
  expect(state.saves[0].game.inventory.gold).toBe(456);
  expect(state.markers[0].phase).toBe('committed');
  expect(state.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
});

test('changed source bytes are not deleted using the prior verified identity', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { Advanced: advanced.state });
  await installInterruption(page, 'changed-source');
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('source changed')] });
  const state = await readStores(page);
  expect(state.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state) + '\n');
  expect(state.storage['DC-GAME-SAVE-SLOTS']).toBe('["Advanced"]');
  expect(state.markers[0].phase).toBe('verified');
});

test('concurrent same-origin importers serialize creates and index cleanup using native transactions', async ({ page, context }) => {
  await openImporter(page);
  const other = await context.newPage();
  await openImporter(other);
  await seedOriginal(page, { 'A B': fresh.state, 'A-B': advanced.state });
  const results = await Promise.all([runImport(page), runImport(other), runImport(page)]);
  expect(results.reduce((sum, result) => sum + result.imported, 0)).toBe(2);
  expect(results.flatMap((result) => result.warnings)).toEqual([]);
  const state = await readStores(page);
  expect(state.saves).toHaveLength(2);
  expect(state.markers).toHaveLength(2);
  expect(state.markers.every((marker) => marker.phase === 'cleaned')).toBe(true);
  expect(state.storage).toEqual({});
  await other.reload();
  expect(await runImport(other)).toEqual({ imported: 0, warnings: [] });
  expect((await readStores(other)).saves).toEqual(state.saves);
});

for (const index of ['{invalid', '{}', 'null']) {
  test(`broken index ${index} does not hide a valid source and remains pending until repaired`, async ({ page }) => {
    await openImporter(page);
    await seedOriginal(page, { Advanced: advanced.state });
    await page.evaluate((value) => localStorage.setItem('DC-GAME-SAVE-SLOTS', value), index);
    const result = await runImport(page);
    expect(result.imported).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    const state = await readStores(page);
    expect(state.saves).toHaveLength(1);
    expect(state.markers[0].phase).toBe('verified');
    expect(state.storage['DC-GAME-ADVANCED']).toBe(JSON.stringify(advanced.state));
    expect(state.storage['DC-GAME-SAVE-SLOTS']).toBe(index);
    await page.evaluate(() => localStorage.setItem('DC-GAME-SAVE-SLOTS', '["Advanced"]'));
    expect(await runImport(page)).toEqual({ imported: 1, warnings: [] });
    expect((await readStores(page)).saves).toEqual(state.saves);
  });
}

test('missing index is recovered and non-string entries do not prevent valid slots', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, { Fresh: fresh.state });
  await page.evaluate(() => localStorage.removeItem('DC-GAME-SAVE-SLOTS'));
  expect(await runImport(page)).toEqual({ imported: 1, warnings: [] });
  await seedOriginal(page, { Advanced: advanced.state });
  await page.evaluate(() => localStorage.setItem('DC-GAME-SAVE-SLOTS', '[null,"Advanced",42]'));
  const result = await runImport(page);
  expect(result.imported).toBe(1);
  expect(result.warnings).toHaveLength(2);
  expect((await readStores(page)).storage).toEqual({ 'DC-GAME-SAVE-SLOTS': '[null,42]' });
});

test('unavailable localStorage or IndexedDB produces a bounded warning, never a rejected bootstrap', async ({ page }) => {
  await openImporter(page);
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked storage', 'SecurityError'); };
    Object.defineProperty(Storage.prototype, 'length', { get() { throw new DOMException('Blocked storage', 'SecurityError'); } });
  });
  const blockedStorage = await runImport(page);
  expect(blockedStorage.imported).toBe(0);
  expect(blockedStorage.warnings.length).toBeGreaterThan(0);
  await page.reload();
  await seedOriginal(page, { Advanced: advanced.state });
  await page.evaluate(() => { IDBFactory.prototype.open = () => { throw new DOMException('Blocked IDB', 'SecurityError'); }; });
  expect(await runImport(page)).toMatchObject({ imported: 0, warnings: [expect.stringContaining('Blocked IDB')] });
  expect(await page.evaluate(() => localStorage.getItem('DC-GAME-ADVANCED'))).toBe(JSON.stringify(advanced.state));
});

test('warnings are bounded even with many invalid source records', async ({ page }) => {
  await openImporter(page);
  await seedOriginal(page, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`bad-${i}`, '{'])));
  const result = await runImport(page);
  expect(result.imported).toBe(0);
  expect(result.warnings).toHaveLength(25);
  expect(result.warnings.at(-1)).toContain('omitted');
  expect((await readStores(page)).saves).toEqual([]);
});

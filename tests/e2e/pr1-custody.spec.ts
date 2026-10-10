import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page) {
  await page.goto('/tests/e2e/pr1-custody-fixture.html');
  await page.waitForFunction(() => !!window.ordinaryCustody);
}

test('durable takeover fences stale state, raw saves and diagnostics in the shared database', async ({ page, context }) => {
  await fixture(page);
  const other = await context.newPage();
  await fixture(other);
  const original = await page.evaluate(() => window.ordinaryCustody.custody.claimGame('a'));
  const winner = await other.evaluate(async () => {
    const h = window.ordinaryCustody;
    const state = await h.custody.claimGame('b', true);
    const saved = await h.custody.updateOwnedGame(state.control, game => ({ ...game, inventory: { ...game.inventory, gold: 812 } }));
    const trace = h.createPlayTelemetry(saved.game.id);
    trace.sequence = 3; trace.counters.goldGained = 777;
    await h.diagnostics.saveTelemetry(trace, saved.control);
    return saved;
  });
  const result = await page.evaluate(async original => {
    const h = window.ordinaryCustody;
    let invoked = false;
    const errors: string[] = [];
    for (const attempt of [
      () => h.custody.updateOwnedGame(original.control, game => { invoked = true; return game; }),
      () => h.repository.saveGame('auto', 'stale', 'auto', original.game),
      () => h.repository.deleteSave('auto'),
      () => h.diagnostics.saveTelemetry(h.createPlayTelemetry(original.game.id), original.control),
      () => h.custody.changeOwnedSave(original.control, { type: 'create', label: 'stale' }),
    ]) { try { await attempt(); } catch (error) { errors.push(String(error)); } }
    return { invoked, errors, state: await h.custody.readGameControl(), trace: await h.diagnostics.loadTelemetry(original.game.id) };
  }, original);
  expect(result.invoked).toBe(false);
  expect(result.errors).toHaveLength(5);
  expect(result.errors.every(error => error.includes('Another tab'))).toBe(true);
  expect(result.state.control).toEqual(winner.control);
  expect(result.state.game?.inventory.gold).toBe(812);
  expect(result.trace?.sequence).toBe(3);
});

test('simultaneous non-takeover claims elect only one owner', async ({ page, context }) => {
  await fixture(page);
  const other = await context.newPage(); await fixture(other);
  const [a, b] = await Promise.all([
    page.evaluate(() => window.ordinaryCustody.custody.claimGame('a')),
    other.evaluate(() => window.ordinaryCustody.custody.claimGame('b')),
  ]);
  expect(a.control).toEqual(b.control);
  expect(a.game.id).toBe(b.game.id);
  expect(a.control.epoch).toBe(1);
});

test('queued pre-takeover mutations fail after admission without running the reducer', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.ordinaryCustody, first = await h.custody.claimGame('a');
    const db = await h.repository.getDatabase();
    const hold = db.transaction(['meta', 'saves'], 'readwrite');
    let release = false;
    const pending = (async () => { while (!release) await hold.objectStore('meta').get('control:auto'); await hold.done; })();
    const takeover = h.custody.claimGame('b', true);
    let invoked = false;
    const stale = h.custody.updateOwnedGame(first.control, game => { invoked = true; return game; }).catch(error => String(error));
    await new Promise(resolve => setTimeout(resolve, 20));
    release = true;
    await pending; await takeover;
    return { stale: await stale, invoked, current: await h.custody.readGameControl() };
  });
  expect(result.stale).toContain('Another tab'); expect(result.invoked).toBe(false);
  expect(result.current.control?.owner).toBe('b');
});

test('snapshot failures roll back game and revision; diagnostics failure cannot roll back accepted play', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.ordinaryCustody, before = await h.custody.claimGame('a');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'saves') throw new DOMException('Injected quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let failure = '';
    try { await h.custody.updateOwnedGame(before.control, game => ({ ...game, dungeonLevel: 99 })); }
    catch (error) { failure = String(error); } finally { IDBObjectStore.prototype.put = put; }
    const rolledBack = await h.custody.readGameControl();
    const saved = await h.custody.updateOwnedGame(before.control, game => ({ ...game, inventory: { ...game.inventory, gold: 900 } }));
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'telemetry') throw new DOMException('Injected diagnostics quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let diagnostics = '';
    try { await h.diagnostics.saveTelemetry(h.createPlayTelemetry(saved.game.id), saved.control); }
    catch (error) { diagnostics = String(error); } finally { IDBObjectStore.prototype.put = put; }
    return { before, rolledBack, failure, diagnostics, after: await h.custody.readGameControl() };
  });
  expect(result.failure).toContain('QuotaExceededError');
  expect(result.rolledBack).toEqual(result.before);
  expect(result.diagnostics).toContain('QuotaExceededError');
  expect(result.after.game?.inventory.gold).toBe(900);
});

for (const width of [1280, 390]) test(`ordinary UI ownership, takeover and reload at ${width}px`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Party', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take control' })).toHaveCount(0);
  const other = await context.newPage();
  await other.setViewportSize({ width, height: 844 });
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Take control' })).toBeVisible();
  const read = () => page.evaluate(async () => {
    const path = '/src/persistence/gameCustody.ts';
    return (await import(/* @vite-ignore */ path)).readGameControl();
  });
  const before = await read();
  await other.getByRole('button', { name: 'Auto', exact: true }).click();
  await other.keyboard.press('ArrowRight');
  await other.waitForTimeout(150);
  expect(await read()).toEqual(before);
  await other.getByRole('button', { name: 'Take control' }).click();
  await expect(other.getByRole('button', { name: 'Take control' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Take control' })).toBeVisible();
  const replaced = await read();
  expect(replaced.control.epoch).toBeGreaterThan(before.control.epoch);
  expect(replaced.game.id).toBe(before.game.id);
  await page.screenshot({ path: info.outputPath('read-only.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await other.reload();
  await expect(other.getByRole('button', { name: 'Party', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Take control' })).toHaveCount(0);
  expect((await read()).game.id).toBe(before.game.id);
});

test('v1 ordinary saves upgrade without changing source state; control survives replacement and failed deletion', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.ordinaryCustody, original = h.createNewGameState({ id: 'v1-original' });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle', 1);
      request.onupgradeneeded = () => {
        const saves = request.result.createObjectStore('saves', { keyPath: 'slotId' });
        saves.createIndex('byUpdatedAt', 'updatedAt'); saves.createIndex('byKind', 'kind');
        request.result.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ slotId: 'auto', kind: 'auto', label: 'v1', createdAt: original.createdAt, updatedAt: original.updatedAt, game: original });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
    const acquired = await h.custody.claimGame('a');
    const copied = await h.custody.changeOwnedSave(acquired.control, { type: 'create', label: 'Keep original' });
    const replacement = await h.custody.updateOwnedGame(copied, () => h.createNewGameState({ id: 'replacement' }));
    let rejected = '';
    try { await h.custody.changeOwnedSave(replacement.control, { type: 'delete', slotId: 'auto' }); }
    catch (error) { rejected = String(error); }
    return { original, acquired, copied, replacement, rejected, final: await h.custody.readGameControl(), slots: await (await h.repository.getDatabase()).getAll('saves') };
  });
  expect(result.acquired.game).toEqual(result.original);
  expect(result.rejected).toContain('cannot be deleted');
  expect(result.final).toEqual(result.replacement);
  expect(result.final.control?.epoch).toBe(result.acquired.control.epoch);
  expect(result.slots.find(slot => slot.kind === 'manual')?.game).toEqual(result.original);
});

test('normalizes an old checkpoint durably before reducers or manual snapshots read it', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.ordinaryCustody, game = h.createNewGameState();
    const old = { ...game } as Partial<typeof game>;
    delete old.inventory; delete old.stash;
    const db = await h.repository.getDatabase();
    await db.put('saves', { slotId: 'auto', label: 'Old', kind: 'auto', game: old as typeof game, createdAt: game.createdAt, updatedAt: game.updatedAt });
    const acquired = await h.custody.claimGame('a');
    const copied = await h.custody.changeOwnedSave(acquired.control, { type: 'create', label: 'Normalized' });
    const next = await h.custody.updateOwnedGame(copied, state => ({ ...state, inventory: { ...state.inventory, gold: state.inventory.gold + 1 } }));
    return { acquired, next, copy: (await db.getAll('saves')).find(slot => slot.kind === 'manual') };
  });
  expect(result.acquired.game.inventory).toBeDefined();
  expect(result.acquired.game.stash).toBeDefined();
  expect(result.copy?.game).toEqual(result.acquired.game);
  expect(result.next.game.inventory.gold).toBe(result.acquired.game.inventory.gold + 1);
});

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/pr1-custody-fixture.html');
  await page.waitForFunction(() => !!window.ordinaryCustody);
});

for (const corruption of ['history', 'control']) test(`reset bypasses corrupt ${corruption} in native IndexedDB`, async ({ page }) => {
  const result = await page.evaluate(async corruption => {
    const { resetGame } = await import('/src/persistence/gameReset.ts');
    const { readRpgHistory } = await import('/src/persistence/observationArchive.ts');
    const h = window.ordinaryCustody, old = await resetGame(), db = await h.repository.getDatabase();
    const slot = (await db.get('saves', 'auto'))!;
    if (corruption === 'history') await db.put('saves', { ...slot, observationHead: 'missing-corrupt-head' });
    else await db.put('meta', { key: 'control:auto', value: '{' });
    const loadErrors: string[] = [];
    for (const takeover of [false, true]) {
      try { await h.custody.claimGame('reader', takeover); } catch (error) { loadErrors.push(String(error)); }
    }
    const next = await resetGame();
    const counts = await Promise.all([...db.objectStoreNames].map(async name => [name, await db.count(name)]));
    return { oldOwner: old.control.owner, oldId: old.game.id, next, loadErrors, counts,
      current: await h.custody.readGameControl(), history: await readRpgHistory() };
  }, corruption);
  expect(result.loadErrors).toHaveLength(2);
  expect(result.next.control.owner).not.toBe(result.oldOwner);
  expect(result.next.game.id).not.toBe(result.oldId);
  expect(result.current).toEqual(result.next);
  expect(result.history.records).toHaveLength(1);
  expect(result.history.records[0]).toMatchObject({ depth: 1, ancestors: [], gameId: result.next.game.id });
  for (const [name, count] of result.counts) {
    expect(count).toBe(['saves', 'meta', 'observations', 'telemetry'].includes(String(name)) ? 1 : 0);
  }
});

for (const store of ['observations', 'saves', 'telemetry']) test(`native reset rolls back every store on ${store} failure`, async ({ page }) => {
  const result = await page.evaluate(async store => {
    const { resetGame } = await import('/src/persistence/gameReset.ts');
    const h = window.ordinaryCustody;
    await resetGame();
    const db = await h.repository.getDatabase();
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    for (const name of db.objectStoreNames) {
      const table = tx.objectStore(name);
      await table.put({ [String(table.keyPath)]: 'sentinel' } as never);
    }
    await tx.done;
    const snapshot = async () => JSON.stringify(await Promise.all([...db.objectStoreNames].map(async name => [name, await db.getAll(name)])));
    const before = await snapshot(), put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === store) throw new DOMException('Injected quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === store) throw new DOMException('Injected quota', 'QuotaExceededError');
      return add.apply(this, args);
    };
    let error = '';
    try { await resetGame(); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add; }
    return { before, after: await snapshot(), error };
  }, store);
  expect(result.error).toContain('QuotaExceededError');
  expect(result.after).toBe(result.before);
});

test('reset fences a stale writer queued behind the native reset transaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { resetGame } = await import('/src/persistence/gameReset.ts');
    const h = window.ordinaryCustody, old = await resetGame(), db = await h.repository.getDatabase();
    const hold = db.transaction(['meta', 'saves'], 'readwrite');
    let release = false;
    const pending = (async () => { while (!release) await hold.objectStore('meta').get('control:auto'); await hold.done; })();
    const resetting = resetGame();
    let invoked = false;
    const stale = h.custody.updateOwnedGame(old.control, game => { invoked = true; return game; }).catch(error => String(error));
    await new Promise(resolve => setTimeout(resolve, 20));
    release = true;
    await pending;
    return { next: await resetting, stale: await stale, invoked, current: await h.custody.readGameControl() };
  });
  expect(result.invoked).toBe(false);
  expect(result.stale).toContain('Another tab');
  expect(result.current).toEqual(result.next);
});

import { test, expect, fixture, seed } from './rpg-command-browser';

test('an existing derived head cannot report ready after its root is lost', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    const ready = await h.memory.prepareRpgMemory();
    if (ready.status !== 'ready') throw new Error('No initial memory');
    const head = (await db.get('rpgMemoryHeads', ready.snapshotId))!;
    await db.delete('rpgMemoryNodes', head.root!);
    const before = await h.custody.readGameControl(), source = await h.history.readRpgHistory();
    let error = '';
    try { await h.memory.prepareRpgMemory(); } catch (e) { error = String(e); }
    return { before, source, error, after: await h.custody.readGameControl(), history: await h.history.readRpgHistory(),
      retainedHead: await db.get('rpgMemoryHeads', ready.snapshotId), head };
  });
  expect(result.error).toContain('Invalid or unavailable memory tree');
  expect(result.after).toEqual(result.before); expect(result.history).toEqual(result.source);
  expect(result.retainedHead).toEqual(result.head);
});

for (const condition of ['prepare-empty', 'query-empty', 'query-incomplete', 'query-ready'] as const) {
  test(`${condition} observes cancellation during the awaited source or cache lookup`, async ({ page }) => {
    await fixture(page);
    const result = await page.evaluate(async condition => {
      const h = window.rpgCommandTest;
      await h.repository.saveGame('auto', 'Cancellation', 'auto', h.game());
      if (condition === 'query-incomplete' || condition === 'query-ready') await h.custody.claimGame('owner');
      if (condition === 'query-ready') await h.memory.prepareRpgMemory();
      const before = await h.custody.readGameControl(), controller = new AbortController(), original = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function(...args) {
        const request = original.apply(this, args);
        const triggerStore = condition.endsWith('empty') ? 'saves' : 'rpgMemoryHeads';
        if (this.name === triggerStore) request.addEventListener('success', () => controller.abort(), { once: true });
        return request;
      };
      let error = '';
      try {
        if (condition === 'prepare-empty') await h.memory.prepareRpgMemory('auto', { signal: controller.signal });
        else await h.memory.readRpgCells('auto', [{ floor: 1, row: 0, column: 1 }], undefined, { signal: controller.signal });
      } catch (e) { error = String(e); }
      finally { IDBObjectStore.prototype.get = original; }
      return { before, error, aborted: controller.signal.aborted, after: await h.custody.readGameControl() };
    }, condition);
    expect(result.aborted).toBe(true);
    expect(result.error).toContain('AbortError');
    expect(result.after).toEqual(result.before);
  });
}

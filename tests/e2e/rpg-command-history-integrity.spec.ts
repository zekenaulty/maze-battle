import { test, expect, fixture, seed } from './rpg-command-browser';

test('history paging stays bounded, proves cursor ancestry, and preserves all source evidence', async ({ page }, info) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 0, explored: [] };
    await h.repository.saveGame('auto', 'History', 'auto', game);
    let state = await h.custody.claimGame('owner');
    const measurements: { count: number; elapsedMs: number; bytes: number; reads: number }[] = [];
    const start = performance.now();
    for (let i = 1; i <= 256; i++) {
      state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: i % 2 ? 2 : 1 } } }));
      if ([16, 64, 256].includes(i)) {
        const begun = performance.now(), first = await h.history.readRpgHistory('auto', { limit: 4 });
        const seek = await h.history.readRpgHistory('auto', { snapshotId: first.snapshotId,
          cursor: { id: first.records[0].ancestors[Math.floor(Math.log2(i))], depth: first.records[0].depth - 2 ** Math.floor(Math.log2(i)) }, limit: 4 });
        measurements.push({ count: i + 1, elapsedMs: performance.now() - begun, bytes: JSON.stringify(seek).length, reads: seek.reads });
      }
    }
    const db = await h.repository.getDatabase(), getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function() { throw new Error('Unbounded history scan forbidden'); };
    const ids: string[] = [], depths: number[] = [], reads: number[] = [];
    try {
      let history = await h.history.readRpgHistory('auto', { limit: 7 });
      while (true) {
        ids.push(...history.records.map(n => n.id)); depths.push(...history.records.map(n => n.depth)); reads.push(history.reads);
        if (!history.next) break;
        history = await h.history.readRpgHistory('auto', { snapshotId: history.snapshotId, cursor: history.next, limit: 7 });
      }
    } finally { IDBObjectStore.prototype.getAll = getAll; }
    const current = await h.history.readRpgHistory('auto', { limit: 1 });
    await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 2 } } }));
    const errors: string[] = [];
    for (const request of [{ limit: 0 }, { limit: 33 }, { cursor: current.next }, { snapshotId: current.snapshotId, cursor: current.next }]) {
      try { await h.history.readRpgHistory('auto', request); } catch (e) { errors.push(String(e)); }
    }
    return { ids, depths, reads, measurements, errors, count: await db.count('observations'), elapsedMs: performance.now() - start };
  });
  expect(result.ids).toHaveLength(257);
  expect(new Set(result.ids).size).toBe(257);
  expect(result.depths).toEqual(Array.from({ length: 257 }, (_, i) => 257 - i));
  expect(Math.max(...result.reads)).toBeLessThanOrEqual(17);
  expect(result.count).toBe(258);
  expect(result.errors).toHaveLength(4);
  expect(result.measurements.every(m => m.reads <= 6 && m.bytes < 4000)).toBe(true);
  await info.attach('history-scaling', { contentType: 'application/json', body: JSON.stringify(result) });
});

for (const corruption of ['missing', 'extra-field', 'dangling-edge', 'wrong-game', 'bad-index'] as const) {
  test(`${corruption} evidence fails closed without rewriting the save or recording a command`, async ({ page }) => {
    const request = await seed(page);
    const result = await page.evaluate(async ({ request, corruption }) => {
      const h = window.rpgCommandTest, db = await h.repository.getDatabase();
      const head = (await db.get('saves', 'auto'))!.observationHead!, node = (await db.get('observations', head))!;
      if (corruption === 'missing') await db.delete('observations', head);
      else {
        if (corruption === 'extra-field') Object.assign(node.observation, { secretDoor: 'unseen' });
        if (corruption === 'dangling-edge') Object.assign(node.observation.cells[0], { links: ['north'] });
        if (corruption === 'wrong-game') node.gameId = 'other';
        if (corruption === 'bad-index') node.ancestors = ['not-a-parent'];
        await db.put('observations', node);
      }
      const before = await h.custody.readGameControl(), errors: string[] = [];
      try { await h.history.readRpgHistory(); } catch (e) { errors.push(String(e)); }
      try { await h.commands.executeOwnedGameCommand(request); } catch (e) { errors.push(String(e)); }
      return { before, after: await h.custody.readGameControl(), errors, receipt: await h.commands.readGameCommand(request) };
    }, { request, corruption });
    expect(result.errors).toHaveLength(2);
    expect(result.after).toEqual(result.before);
    expect(result.receipt).toBeUndefined();
  });
}

for (const store of ['observations', 'saves', 'meta', 'gameCommands'] as const) {
  test(`quota failure at ${store} preserves the archive and snapshot head atomically`, async ({ page }) => {
    const request = await seed(page);
    const result = await page.evaluate(async ({ request, store }) => {
      const h = window.rpgCommandTest, db = await h.repository.getDatabase();
      const before = await h.history.readRpgHistory(), count = await db.count('observations');
      const method = store === 'observations' || store === 'gameCommands' ? 'add' : 'put', original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) {
        if (this.name === store) throw new DOMException('Injected archive quota', 'QuotaExceededError');
        return original.apply(this, args);
      };
      let error = '';
      try { await h.commands.executeOwnedGameCommand(request); } catch (e) { error = String(e); }
      finally { IDBObjectStore.prototype[method] = original; }
      return { before, count, error, after: await h.history.readRpgHistory(), finalCount: await db.count('observations') };
    }, { request, store });
    expect(result.error).toContain('QuotaExceededError');
    expect(result.after).toEqual(result.before);
    expect(result.finalCount).toBe(result.count);
  });
}

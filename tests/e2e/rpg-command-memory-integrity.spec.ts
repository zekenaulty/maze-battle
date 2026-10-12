import { test, expect, seed } from './rpg-command-browser';

for (const condition of ['read-budget', 'write-budget', 'cancel-before', 'cancel-during', 'node-quota', 'head-quota'] as const) {
  test(`${condition} aborts derived memory work without changing the game, source archive or partial index`, async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(async condition => {
      const h = window.rpgCommandTest, db = await h.repository.getDatabase(), controller = new AbortController();
      const before = await h.custody.readGameControl(), sources = await h.history.readRpgHistory();
      const add = IDBObjectStore.prototype.add;
      if (condition === 'cancel-before') controller.abort();
      IDBObjectStore.prototype.add = function(...args) {
        if (this.name === 'rpgMemoryNodes') {
          if (condition === 'node-quota') throw new DOMException('Injected node quota', 'QuotaExceededError');
          if (condition === 'cancel-during') controller.abort();
        }
        if (this.name === 'rpgMemoryHeads' && condition === 'head-quota') throw new DOMException('Injected head quota', 'QuotaExceededError');
        return add.apply(this, args);
      };
      let error = '';
      try { await h.memory.prepareRpgMemory('auto', { signal: controller.signal,
        ...(condition === 'read-budget' ? { maxReads: 1 } : {}), ...(condition === 'write-budget' ? { maxWrites: 1 } : {}) }); }
      catch (e) { error = String(e); }
      finally { IDBObjectStore.prototype.add = add; }
      const counts = [await db.count('rpgMemoryNodes'), await db.count('rpgMemoryHeads')];
      const after = await h.custody.readGameControl(), finalSources = await h.history.readRpgHistory();
      return { before, after, sources, finalSources, counts, error, recovery: await h.memory.prepareRpgMemory() };
    }, condition);
    expect(result.error).not.toBe('');
    expect(result.after).toEqual(result.before);
    expect(result.finalSources).toEqual(result.sources);
    expect(result.counts).toEqual([0, 0]);
    expect(result.recovery.status).toBe('ready');
  });
}

for (const condition of ['head-witness', 'tree-witness', 'missing-source', 'source-shape'] as const) {
  test(`${condition} prevents memory output instead of falling back to authoritative world state`, async ({ page }) => {
    await seed(page);
    const result = await page.evaluate(async condition => {
      const h = window.rpgCommandTest, db = await h.repository.getDatabase();
      await h.memory.prepareRpgMemory();
      const before = await h.custody.readGameControl();
      const id = (await h.history.readRpgHistory()).snapshotId!, head = (await db.get('rpgMemoryHeads', id))!;
      if (condition === 'head-witness') await db.put('rpgMemoryHeads', { ...head, cellCount: head.cellCount + 1 });
      if (condition === 'tree-witness') {
        const root = (await db.get('rpgMemoryNodes', head.root!))!;
        await db.put('rpgMemoryNodes', { ...root, prefix: 'fake' });
      }
      if (condition === 'missing-source') await db.delete('observations', id);
      if (condition === 'source-shape') {
        const node = (await db.get('observations', id))!;
        Object.assign(node.observation, { hidden: true }); await db.put('observations', node);
      }
      let error = '';
      try { await h.memory.readRpgCells('auto', [{ floor: 1, row: 0, column: 1 }]); } catch (e) { error = String(e); }
      return { before, after: await h.custody.readGameControl(), error };
    }, condition);
    expect(result.error).not.toBe('');
    expect(result.after).toEqual(result.before);
  });
}

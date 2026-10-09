import { expect, test } from '@playwright/test';
import { storageFixture } from '../../src/domain/expedition/storage.testSupport';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/expedition-storage-fixture.html');
});

test('round trips owned snapshots through reload without creating the ordinary database', async ({ page }) => {
  const fixture = storageFixture();
  const result = await page.evaluate(async input => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo: typeof import('../../src/persistence/expeditionRepository') = await import(/* @vite-ignore */ path);
    const before = await indexedDB.databases();
    const missing = await repo.loadExpedition('missing');
    const pending = repo.saveExpedition('fixture', input.plan, input.checkpoint, null);
    input.plan.recipe.seed = 99;
    input.checkpoint.openedChestIds.length = 0;
    await pending;
    const loaded = await repo.loadExpedition('fixture');
    loaded!.plan.recipe.seed = 100;
    loaded!.checkpoint.knowledge.chests['chest-a'].opened = false;
    return { before, missing, loadedAgain: await repo.loadExpedition('fixture'), databases: await indexedDB.databases() };
  }, fixture);
  expect(result.before).toEqual([]);
  expect(result.missing).toBeUndefined();
  expect(result.loadedAgain).toEqual(fixture);
  expect(result.databases.map(db => db.name)).toEqual(['maze-battle-expeditions']);
  await page.reload();
  expect(await page.evaluate(async () => {
    const path = '/src/persistence/expeditionRepository.ts';
    return (await import(/* @vite-ignore */ path)).loadExpedition('fixture');
  })).toEqual(fixture);
});

test('create-only is strict; exact revision retries are no-ops, not stale overwrites', async ({ page }) => {
  const result = await page.evaluate(async ({ plan, checkpoint }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    const failures: string[] = [];
    const attempt = async (value: typeof checkpoint, expected: number | null, slot = 'slot') => {
      try { await repo.saveExpedition(slot, plan, value, expected); }
      catch (error) { failures.push(String(error)); }
    };
    await repo.saveExpedition('slot', plan, checkpoint, null);
    await attempt(checkpoint, null);
    const next = { ...checkpoint, revision: 3, moves: 3 };
    await repo.saveExpedition('slot', plan, next, 0);
    const reordered = Object.fromEntries(Object.entries(next).reverse());
    await repo.saveExpedition('slot', plan, reordered, 0);
    await repo.saveExpedition('slot', plan, next, 3);
    await attempt({ ...next, moves: 4 }, 3);
    await attempt(checkpoint, 0);
    await attempt({ ...next, revision: 4 }, 0);
    await attempt(next, 4);
    await attempt(next, -1);
    await attempt(next, 0, 'missing');
    return { failures, saved: await repo.loadExpedition('slot'), missing: await repo.loadExpedition('missing') };
  }, storageFixture());
  expect(result.failures).toHaveLength(7);
  expect(result.failures.every(error => error.includes('Invalid expedition'))).toBe(true);
  expect(result.saved).toEqual({ ...storageFixture(), checkpoint: { ...storageFixture().checkpoint, revision: 3, moves: 3 } });
  expect(result.missing).toBeUndefined();
});

test('serializes competing creates and cross-page checkpoint compare-and-set transactions', async ({ page, context }) => {
  const fixture = storageFixture();
  const creates = await page.evaluate(async ({ plan, checkpoint }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    return (await Promise.allSettled([
      repo.saveExpedition('race', plan, checkpoint, null), repo.saveExpedition('race', plan, checkpoint, null),
    ])).map(result => result.status);
  }, fixture);
  expect(creates.sort()).toEqual(['fulfilled', 'rejected']);
  const other = await context.newPage();
  await other.goto('/tests/e2e/expedition-storage-fixture.html');
  const attempts = await Promise.all([page, other].map((target, index) => target.evaluate(async ({ input, revision }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    try {
      await repo.saveExpedition('race', input.plan, { ...input.checkpoint, revision, moves: revision }, 0);
      return { status: 'fulfilled', revision };
    } catch { return { status: 'rejected', revision }; }
  }, { input: fixture, revision: index + 1 })));
  expect(attempts.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  const winner = attempts.find(result => result.status === 'fulfilled')!.revision;
  expect(await page.evaluate(async () => {
    const path = '/src/persistence/expeditionRepository.ts';
    return (await (await import(/* @vite-ignore */ path)).loadExpedition('race')).checkpoint.revision;
  })).toBe(winner);
});

test('rejects replacement worlds, recipes, versions and geometry with the previous record intact', async ({ page }) => {
  const fixture = storageFixture();
  const result = await page.evaluate(async input => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    await repo.saveExpedition('slot', input.plan, input.checkpoint, null);
    const changes = [
      (r: typeof input) => { r.plan.recipe.worldId = r.checkpoint.worldId = 'other-world'; },
      (r: typeof input) => { r.plan.recipe.floorId = r.checkpoint.floorId = 'other-floor'; },
      (r: typeof input) => { r.plan.scopeId = r.checkpoint.scopeId = 'other-scope'; },
      (r: typeof input) => { r.plan.recipe.seed++; },
      (r: typeof input) => { r.plan.spaces[0].seed++; },
      (r: typeof input) => { Object.assign(r.plan.recipe, { version: 'spaces-v2' }); },
      (r: typeof input) => { Object.assign(r.checkpoint, { version: 2 }); },
      (r: typeof input) => { r.plan.spaces[0].rows++; },
    ];
    let rejected = 0;
    for (const change of changes) {
      const next = structuredClone(input);
      next.checkpoint.revision = 1;
      change(next);
      try { await repo.saveExpedition('slot', next.plan, next.checkpoint, 0); }
      catch { rejected++; }
    }
    return { rejected, saved: await repo.loadExpedition('slot') };
  }, fixture);
  expect(result.rejected).toBe(8);
  expect(result.saved).toEqual(fixture);
});

test('aborted transactions and injected quota failures preserve the last committed record', async ({ page }) => {
  const fixture = storageFixture();
  const result = await page.evaluate(async ({ plan, checkpoint }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    await repo.saveExpedition('slot', plan, checkpoint, null);
    const put = IDBObjectStore.prototype.put;
    const failures: string[] = [];
    const snapshots = [];
    for (const mode of ['abort', 'quota']) {
      IDBObjectStore.prototype.put = function (value, key) {
        if (mode === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError');
        const request = put.call(this, value, key);
        this.transaction.abort();
        return request;
      };
      try { await repo.saveExpedition('slot', plan, { ...checkpoint, revision: 1 }, 0); }
      catch (error) { failures.push(String(error)); }
      finally { IDBObjectStore.prototype.put = put; }
      snapshots.push(await repo.loadExpedition('slot'));
    }
    await repo.saveExpedition('slot', plan, { ...checkpoint, revision: 1 }, 0);
    return { failures, snapshots, recovered: await repo.loadExpedition('slot') };
  }, fixture);
  expect(result.failures[0]).toContain('AbortError');
  expect(result.failures[1]).toContain('QuotaExceededError');
  expect(result.snapshots).toEqual([fixture, fixture]);
  expect(result.recovered.checkpoint.revision).toBe(1);
});

test('corrupt stored records are rejected on load and write without repair', async ({ page }) => {
  const result = await page.evaluate(async input => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    await repo.saveExpedition('corrupt', input.plan, input.checkpoint, null);
    const corrupt = structuredClone(input);
    corrupt.checkpoint.openedChestIds.push('invented-loot');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('maze-battle-expeditions', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('expeditions', 'readwrite');
    tx.objectStore('expeditions').put(corrupt, 'corrupt');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    const failures = [];
    try { await repo.loadExpedition('corrupt'); } catch (error) { failures.push(String(error)); }
    try { await repo.saveExpedition('corrupt', input.plan, { ...input.checkpoint, revision: 1 }, 0); }
    catch (error) { failures.push(String(error)); }
    const request = db.transaction('expeditions').objectStore('expeditions').get('corrupt');
    const raw = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return { failures, raw, corrupt };
  }, storageFixture());
  expect(result.failures).toHaveLength(2);
  expect(result.failures.every(error => error.includes('opened chest identities'))).toBe(true);
  expect(result.raw).toEqual(result.corrupt);
});

test('deletion is slot-scoped and idempotent; replacement needs an explicit delete', async ({ page }) => {
  const result = await page.evaluate(async ({ plan, checkpoint }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    await repo.saveExpedition('a', plan, checkpoint, null);
    await repo.saveExpedition('b', plan, checkpoint, null);
    await repo.deleteExpedition('a');
    await repo.deleteExpedition('a');
    const deleted = await repo.loadExpedition('a');
    plan.recipe.seed++;
    await repo.saveExpedition('a', plan, checkpoint, null);
    return { deleted, a: await repo.loadExpedition('a'), b: await repo.loadExpedition('b') };
  }, storageFixture());
  expect(result.deleted).toBeUndefined();
  expect(result.b).toEqual(storageFixture());
  expect(result.a.plan.recipe.seed).toBe(43);
});

test('a stored undefined value is corrupt, not a missing slot eligible for create', async ({ page }) => {
  const result = await page.evaluate(async ({ plan, checkpoint }) => {
    const path = '/src/persistence/expeditionRepository.ts';
    const repo = await import(/* @vite-ignore */ path);
    await repo.loadExpedition('slot');
    const request = indexedDB.open('maze-battle-expeditions', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('expeditions', 'readwrite');
    tx.objectStore('expeditions').put(undefined, 'slot');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    db.close();
    const failures = [];
    try { await repo.loadExpedition('slot'); } catch (error) { failures.push(String(error)); }
    try { await repo.saveExpedition('slot', plan, checkpoint, null); } catch (error) { failures.push(String(error)); }
    try { await repo.loadExpedition('slot'); } catch (error) { failures.push(String(error)); }
    return failures;
  }, storageFixture());
  expect(result).toHaveLength(3);
  expect(result.every(error => error.includes('Invalid expedition: record'))).toBe(true);
});

test('opened loot and sparse snapshots survive eviction, checkpointing and reload', async ({ page }) => {
  const fixture = storageFixture();
  const before = await page.evaluate(async ({ plan, checkpoint }) => {
    const repositoryPath = '/src/persistence/expeditionRepository.ts';
    const residencyPath = '/src/domain/expedition/residency.ts';
    const helperPath = '/src/domain/expedition/storage.testSupport.ts';
    const repo = await import(/* @vite-ignore */ repositoryPath);
    const { SpaceResidency } = await import(/* @vite-ignore */ residencyPath);
    const { sparseTestGeometry: testGeometry } = await import(/* @vite-ignore */ helperPath);
    const cache = new SpaceResidency(6, testGeometry);
    const first = cache.get(plan.spaces[0]);
    cache.get(plan.spaces[1]);
    const regenerated = cache.get(plan.spaces[0]);
    await repo.saveExpedition('fixture', plan, checkpoint, null);
    return { first, regenerated, stats: cache.stats() };
  }, fixture);
  expect(before.first).toEqual(before.regenerated);
  expect(before.first.cells).toHaveLength(3);
  expect(before.stats).toEqual({ residentSpaces: 1, residentCells: 4, loads: 3, evictions: 2 });
  await page.reload();
  const after = await page.evaluate(async () => {
    const repositoryPath = '/src/persistence/expeditionRepository.ts';
    const residencyPath = '/src/domain/expedition/residency.ts';
    const helperPath = '/src/domain/expedition/storage.testSupport.ts';
    const { SpaceResidency } = await import(/* @vite-ignore */ residencyPath);
    const { sparseTestGeometry: testGeometry } = await import(/* @vite-ignore */ helperPath);
    const record = await (await import(/* @vite-ignore */ repositoryPath)).loadExpedition('fixture');
    return { record, geometry: new SpaceResidency(6, testGeometry).get(record.plan.spaces[0]) };
  });
  expect(after.record).toEqual(fixture);
  expect(after.record.checkpoint.openedChestIds).toEqual(['chest-a']);
  expect(after.geometry).toEqual(before.first);
});

import { test, expect } from '@playwright/test';
import type {} from './canonical-quality-fixture';

for (const store of ['records', 'nodes', 'receipts', 'heads']) test(`native ${store} failure rolls back nodes, cursor and receipt`, async ({ page }) => {
  const result = await page.evaluate(async store => {
    const c = window.canonicalQuality; await c.seedWorld(); await c.begin(); const before = await c.snapshot();
    const original = await c.request('fixture.quality.advance', { level: 1, maxRooms: 4 });
    const method = store === 'heads' ? 'put' : 'add', native = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true,
      value: function(this: IDBObjectStore, ...args: unknown[]) {
        if (this.transaction.db.name === 'maze-battle' && this.name === store) throw new DOMException('Quality fixture failure', 'QuotaExceededError');
        return Reflect.apply(native, this, args);
      } });
    let failure = '';
    try { await c.advance(original); } catch (error) { failure = String(error); }
    finally { Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: native }); }
    const after = await c.snapshot(), retry = await c.advance(original), replay = await c.advance(original);
    return { before, after, failure, retry, replay, state: (await c.state()).value };
  }, store);
  expect(result.failure).toContain('Quality fixture failure'); expect(result.after).toEqual(result.before);
  expect(result.retry.replayed).toBe(false); expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(result.retry.receipt); expect(result.replay.keys).toEqual([]);
  expect(result.state.nextRoom).toBe(20);
});

test('competing revision and altered original request reject without skipping nodes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(); await c.begin();
    const first = await c.request('fixture.quality.advance', { level: 1, maxRooms: 4 });
    const stale = await c.request('fixture.quality.advance', { level: 1, maxRooms: 4 });
    await c.advance(first); const before = await c.snapshot();
    const conflict = await c.advance(stale).catch(String);
    const changed = await c.advance({ ...first, input: { level: 1, maxRooms: 1 } }, 1).catch(String);
    const replay = await c.advance(first); return { conflict, changed, before, after: await c.snapshot(), replay };
  });
  expect(result.conflict).toContain('stale owner or revision'); expect(typeof result.changed).toBe('string');
  expect(result.replay.replayed).toBe(true); expect(result.after).toEqual(result.before);
});

test('budget exhaustion rolls back and the original uncommitted attempt can retry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(); await c.begin(); const before = await c.snapshot();
    const original = await c.request('fixture.quality.advance', { level: 1, maxRooms: 4 });
    const failure = await c.executeCanonical(original, async ({ pages }) => c.json(await c.quality.advanceWorldFloorQuality(pages, 1)),
      { limits: { reads: 2048, writes: 1, bytes: 4 * 1024 * 1024 } }).catch(String);
    const after = await c.snapshot(), retry = await c.advance(original); return { before, after, failure, retry };
  });
  expect(result.failure).toContain('write budget exhausted'); expect(result.after).toEqual(result.before);
  expect(result.retry.replayed).toBe(false);
});

for (const verdict of ['qualified', 'failed']) test(`${verdict} is published only with the original terminal receipt`, async ({ page }) => {
  const result = await page.evaluate(async verdict => {
    const c = window.canonicalQuality;
    if (verdict === 'qualified') await c.seedWorld(781, 8); else await c.seedChain();
    await c.begin();
    for (let batch = 0; batch < 16; batch++) {
      const current = (await c.state()).value;
      if (current.nextRoom === 0) break;
      await c.advance(undefined, Math.min(4, current.nextRoom));
    }
    const before = await c.snapshot(), original = await c.request('fixture.quality.advance', { level: 1, maxRooms: 1 });
    const native = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args: Parameters<typeof native>) {
      if (this.transaction.db.name === 'maze-battle' && this.name === 'receipts') throw new DOMException('Terminal receipt failure', 'QuotaExceededError');
      return Reflect.apply(native, this, args);
    };
    let failure = '';
    try { await c.advance(original, 1); } catch (error) { failure = String(error); }
    finally { IDBObjectStore.prototype.add = native; }
    const after = await c.snapshot(), retry = await c.advance(original, 1);
    const replay = await c.executeCanonical(original, async () => { throw Error('Terminal must replay'); });
    return { before, after, failure, retry, replay, state: (await c.state()).value };
  }, verdict);
  expect(result.failure).toContain('Terminal receipt failure'); expect(result.after).toEqual(result.before);
  expect(result.state.status).toBe(verdict); expect(result.state.nextRoom).toBe(-1);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.retry.receipt);
});

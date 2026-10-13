import { test, expect } from '@playwright/test';
import type {} from './canonical-role-fixture';

const origin = 'http://127.0.0.1:5210';
test.beforeEach(async ({ page, context, baseURL }) => {
  test.skip(baseURL !== origin, 'Independent role fixture requires its own port 5210 config');
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-role-fixture.html');
  await page.waitForFunction(() => !!window.canonicalRoles);
  // Once fixture code is loaded, all domain and IndexedDB work runs fully offline.
  await context.setOffline(true);
});

for (const joins of ['direct', 'mixed', 'passage'] as const) test(`offline ${joins} roles match compiled full-floor assignment`, async ({ page }) => {
  const result = await page.evaluate(async joins => {
    const c = window.canonicalRoles;
    const before = await c.seedWorld(781, 25, joins);
    const begun = await c.begin(), batches = [];
    for (let batch = 0; batch < 4; batch++) batches.push(await c.advance());
    const parity = await c.parity();
    return { before, begun: begun.receipt.result, batches, parity };
  }, joins);
  expect(result.parity.actual).toEqual(result.parity.expected);
  expect(result.parity.floor).toEqual(result.before);
  expect(result.parity.compilation.nextRoom).toBe(25);
  expect(result.parity.compilation.plan!.specialtyIds).toHaveLength(5);
  expect(result.begun).toMatchObject({ nextRoom: 0, plan: null });
  for (const batch of result.batches) {
    expect(batch.keys.length).toBeLessThanOrEqual(67);
    expect(batch.keys.filter(key => /\/(space|ports)\//.test(key)).length).toBeLessThanOrEqual(16);
    expect(batch.keys.some(key => key.includes(':passage'))).toBe(false);
    expect(batch.stats.reads).toBeLessThanOrEqual(2048);
  }
  expect(result.parity.actual.filter(room => room.kind === 'ordinary')).toHaveLength(17);
});

test('reload resumes the original attempt receipt and cursor without repeating work', async ({ page, context }) => {
  const before = await page.evaluate(async () => {
    const c = window.canonicalRoles; await c.seedWorld(); await c.begin();
    const original = await c.request('fixture.roles.advance', { level: 1, maxRooms: 3 });
    const applied = await c.advance(original, 3);
    return { original, receipt: applied.receipt, state: (await c.state()).value, sizes: await c.sizes() };
  });
  await context.setOffline(false); await page.reload();
  await page.waitForFunction(() => !!window.canonicalRoles); await context.setOffline(true);
  const after = await page.evaluate(async serialized => {
    const c = window.canonicalRoles;
    const original = JSON.parse(serialized);
    const replay = await c.executeCanonical(original, async () => { throw Error('Original attempt must replay, not recompile'); });
    const unchanged = { state: (await c.state()).value, sizes: await c.sizes() };
    await c.finishRoles();
    return { replay, unchanged, parity: await c.parity() };
  }, JSON.stringify(before.original));
  expect(after.replay.replayed).toBe(true); expect(after.replay.receipt).toEqual(before.receipt);
  expect(after.unchanged.state).toEqual(before.state); expect(after.unchanged.sizes).toEqual(before.sizes);
  expect(after.parity.actual).toEqual(after.parity.expected);
});

for (const store of ['records', 'receipts', 'heads']) test(`native ${store} failure rolls back cursor, accumulator and receipt`, async ({ page }) => {
  const result = await page.evaluate(async store => {
    const c = window.canonicalRoles; await c.seedWorld(); await c.begin();
    const before = { state: await c.state(), sizes: await c.sizes() };
    const original = await c.request('fixture.roles.advance', { level: 1, maxRooms: 8 });
    const method = store === 'heads' ? 'put' : 'add', native = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true,
      value: function(this: IDBObjectStore, ...args: unknown[]) {
        if (this.transaction.db.name === 'maze-battle' && this.name === store) throw new DOMException('Role fixture failure', 'QuotaExceededError');
        return Reflect.apply(native, this, args);
      } });
    let failure = '';
    try { await c.advance(original); } catch (error) { failure = String(error); }
    finally { Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: native }); }
    const after = { state: await c.state(), sizes: await c.sizes() };
    const retry = await c.advance(original), replay = await c.advance(original);
    return { before, after, failure, retry, replay, state: (await c.state()).value };
  }, store);
  expect(result.failure).toContain('Role fixture failure');
  expect(result.after.state.head).toEqual(result.before.state.head);
  expect(result.after.state.value).toEqual(result.before.state.value); expect(result.after.sizes).toEqual(result.before.sizes);
  expect(result.retry.replayed).toBe(false); expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(result.retry.receipt); expect(result.replay.keys).toEqual([]);
  expect(result.state.nextRoom).toBe(8); expect(result.state.accumulator.roomCount).toBe(8);
});

test('stale competing attempts cannot skip a batch, while the original committed attempt replays', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalRoles; await c.seedWorld(); await c.begin();
    const first = await c.request('fixture.roles.advance', { level: 1, maxRooms: 8 });
    const stale = await c.request('fixture.roles.advance', { level: 1, maxRooms: 8 });
    await c.advance(first);
    const rejected = await c.advance(stale).catch(String), replay = await c.advance(first);
    return { rejected, replayed: replay.replayed, state: (await c.state()).value };
  });
  expect(result.rejected).toContain('stale owner or revision'); expect(result.replayed).toBe(true);
  expect(result.state.nextRoom).toBe(8);
});

test('unfinished floors refuse role preparation without changing generation or head', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalRoles; const floor = await c.seedWorld(42, 24, 'mixed', false);
    const before = (await c.readCanonicalHead()).head;
    const failure = await c.begin().catch(String);
    return { before, failure, floor, after: (await c.readCanonicalHead()).head,
      current: (await c.readCanonical(pages => c.loadFloor(pages, 1))).value };
  });
  expect(result.failure).toContain('completed generation'); expect(result.after).toEqual(result.before);
  expect(result.current).toEqual(result.floor);
});

test('lookup rejects missing ordinary rooms and changed final plans', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalRoles; await c.seedWorld(); await c.finishRoles();
    const ordinary = (await c.parity()).expected.find(room => room.kind === 'ordinary')!;
    await c.executeCanonical(await c.request('fixture.damage'), async ({ pages }) => {
      await pages.delete('world', `dungeon/1/space/${ordinary.id}`); return null;
    });
    const missing = await c.readCanonical(pages => c.roles.loadWorldRoomRole(pages, 1, ordinary.id)).catch(String);
    await c.executeCanonical(await c.request('fixture.damage'), async ({ pages }) => {
      const state = await c.roles.loadWorldRoleCompilation(pages, 1);
      await pages.set('world', 'dungeon/1/roles', c.json({ ...state, plan: { ...state.plan, specialtyIds: [] } })); return null;
    });
    const invalid = await c.readCanonical(pages => c.roles.loadWorldRoomRole(pages, 1, 'entry')).catch(String);
    return { missing, invalid };
  });
  expect(result.missing).toContain('missing established world record'); expect(result.invalid).toContain('plan');
});

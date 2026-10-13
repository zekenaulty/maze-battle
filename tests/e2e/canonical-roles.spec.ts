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

for (const expansions of [0, 1, 6]) test(`partial generation after ${expansions} expansions rejects every role API without publication`, async ({ page }) => {
  const result = await page.evaluate(async expansions => {
    const c = window.canonicalRoles;
    const floor = await c.seedWorld(42, 8, 'mixed', expansions);
    return { floor, ...await c.roleRejections() };
  }, expansions);
  expect(result.floor.generation.rooms).toBe(expansions + 1);
  expect(result.floor.generation.revision).toBe(expansions);
  expect(result.floor.generation.pendingCount).toBeGreaterThan(0);
  expect(result.floor.exit).toBeNull(); expect(result.before.roles).toBeUndefined();
  expect(result.failures.map(failure => failure.operation)).toEqual(['begin', 'advance', 'status', 'lookup']);
  for (const failure of result.failures) {
    expect(failure.error).toBe('Canonical storage: role preparation requires completed generation');
    expect(failure.after).toEqual(result.before);
  }
});

for (const phase of ['partial', 'complete'] as const) test(`changed generation scope rejects a ${phase} role compilation without resetting it`, async ({ page }) => {
  const result = await page.evaluate(async phase => {
    const c = window.canonicalRoles; await c.seedWorld(781, 8); await c.begin();
    if (phase === 'complete') await c.finishRoles(); else await c.advance(undefined, 3);
    const prepared = (await c.state()).value;
    await c.executeCanonical(await c.request('fixture.change-generation'), async ({ pages }) => {
      const floor = await c.loadFloor(pages, 1), recipe = { ...floor.generation.recipe, seed: 782 };
      await pages.set('world', 'dungeon/1', c.json({ ...floor,
        generation: { ...floor.generation, recipe, scopeId: JSON.stringify(recipe) } }), ['floors/1']);
      return null;
    });
    // The header still passes loadFloor; rejection must come from the role binding.
    const floor = (await c.readCanonical(pages => c.loadFloor(pages, 1))).value;
    return { prepared, floor, ...await c.roleRejections() };
  }, phase);
  expect(result.prepared.nextRoom).toBe(phase === 'complete' ? 8 : 3);
  expect(result.prepared.plan === null).toBe(phase === 'partial');
  expect(result.floor.generation.recipe.seed).toBe(782);
  expect(result.floor.generation.rooms).toBe(result.floor.generation.recipe.roomBudget);
  expect(result.floor.generation.scopeId).not.toBe(result.prepared.binding.scopeId);
  expect(result.before.roles!.value).toEqual(result.prepared);
  expect(result.failures.map(failure => failure.operation)).toEqual(['begin', 'advance', 'status', 'lookup']);
  for (const failure of result.failures) {
    expect(failure.error).toBe('Canonical storage: stale or invalid room role binding');
    expect(failure.after).toEqual(result.before);
  }
});

for (const field of ['scopeId', 'revision', 'roomCount', 'entryId', 'exitId'] as const) {
  test(`stale role binding ${field} fails exactly and preserves stored progress`, async ({ page }) => {
    const result = await page.evaluate(async field => {
      const c = window.canonicalRoles; await c.seedWorld(781, 8); await c.begin(); await c.advance(undefined, 3);
      await c.executeCanonical(await c.request('fixture.damage-binding'), async ({ pages }) => {
        const state = await c.roles.loadWorldRoleCompilation(pages, 1), binding = { ...state.binding };
        switch (field) {
          case 'scopeId': binding.scopeId += ':stale'; break;
          case 'revision': binding.revision--; break;
          case 'roomCount': binding.roomCount++; break;
          case 'entryId': binding.entryId = 'socket-0:room'; break;
          case 'exitId': binding.exitId = 'entry'; break;
        }
        await pages.set('world', 'dungeon/1/roles', c.json({ ...state, binding })); return null;
      });
      return c.roleRejections();
    }, field);
    expect(result.failures.map(failure => failure.operation)).toEqual(['begin', 'advance', 'status', 'lookup']);
    for (const failure of result.failures) {
      expect(failure.error).toBe('Canonical storage: stale or invalid room role binding');
      expect(failure.after).toEqual(result.before);
    }
  });
}

test('partial role compilation on a completed floor cannot supply role metadata', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalRoles; const floor = await c.seedWorld(781, 8);
    await c.begin(); await c.advance(undefined, 3);
    const state = (await c.state()).value, before = await c.roleSnapshot();
    const failure = await c.readCanonical(pages => c.roles.loadWorldRoomRole(pages, 1, 'entry'))
      .then(() => null, error => error instanceof Error ? error.message : String(error));
    return { floor, state, before, failure, after: await c.roleSnapshot() };
  });
  expect(result.floor.exit).not.toBeNull(); expect(result.floor.generation.pendingCount).toBe(0);
  expect(result.state.nextRoom).toBe(3); expect(result.state.accumulator.roomCount).toBe(3);
  expect(result.state.plan).toBeNull();
  expect(result.failure).toBe('Canonical storage: room roles are not prepared');
  expect(result.after).toEqual(result.before);
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

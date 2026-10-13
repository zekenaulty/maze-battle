import { expect, test } from './canonical-agentica.test';

for (const store of ['records', 'nodes', 'operations', 'receipts', 'heads']) test(`real navigation admission: ${store} failure rolls back result and allocation`, async ({ page }) => {
  const r = await page.evaluate(async store => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const host = await n.host(seeded.action), before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await n.navigation.executeNavigationCommand(request, { host }); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const after = await c.dump(), pending = (await c.reconcile(seeded.action)).value;
    const retry = await n.navigation.executeNavigationCommand(request, { host: await n.host(seeded.action) });
    return { before, after, error, pending, retry, completed: (await c.reconcile(seeded.action)).value };
  }, store);
  expect(r.error).toContain('QuotaExceededError'); expect(r.after).toBe(r.before); expect(r.pending!.status).toBe('pending');
  expect(r.retry.replayed).toBe(false); expect(r.completed!.status).toBe('completed'); expect(r.retry.head!.allocations.trip).toBeDefined();
});

test('native action-result write failure rolls back movement, new observation and retained progress', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    await n.navigation.executeNavigationCommand(await n.admission(seeded.target));
    const request = await n.advance(), host = await n.host(seeded.action), identity = await c.prepareAction(seeded.action), before = await c.dump();
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'records' && args[0]?.key === `${identity.storageKey}/result`) throw new DOMException('Injected', 'QuotaExceededError');
      return add.apply(this, args);
    };
    let error = '';
    try { await n.navigation.executeNavigationCommand(request, { host }); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; }
    return { before, after: await c.dump(), error, pending: (await c.reconcile(seeded.action)).value };
  });
  expect(r.error).toContain('QuotaExceededError'); expect(r.after).toBe(r.before); expect(r.pending!.status).toBe('pending');
});

for (const fault of ['result', 'witness', 'aggregate'] as const) test(`${fault} byte limits reject without partial navigation state`, async ({ page }) => {
  const r = await page.evaluate(async fault => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const identity = await c.prepareAction(seeded.action), original = await n.host(seeded.action), before = await c.dump();
    const host = fault === 'result' ? c.navigationActionHooks(identity, view => ({ ...n.result(seeded.action, view), summary: 'x'.repeat(4096) })) : {
      prepare: original.prepare,
      commit: async (view: Parameters<typeof original.commit>[0]) => {
        if (fault === 'witness') {
          try { await view.appendExecution('fixture/too-large', 'x'.repeat(13000)); } catch { /* Guard must retain the failure. */ }
          return {};
        }
        return { actionResult: await view.appendExecution('fixture/first', 'x'.repeat(9000)), event: await view.appendExecution('fixture/second', 'x'.repeat(9000)) };
      },
    };
    const error = await n.navigation.executeNavigationCommand(request, { host }).catch(String);
    return { before, after: await c.dump(), error };
  }, fault);
  expect(String(r.error)).toContain(fault === 'result' ? '4096 bytes' : fault === 'aggregate' ? '16384 bytes' : 'not usable');
  expect(r.after).toBe(r.before);
});

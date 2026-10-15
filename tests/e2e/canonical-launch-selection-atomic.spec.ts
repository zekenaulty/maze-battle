import { test, expect } from './canonical-launch.test';

for (const store of ['records', 'nodes', 'receipts', 'heads']) test(`renewal ${store} failure retains the old pointer and exact retry`, async ({ page }) => {
  const r = await page.evaluate(async store => {
    const c = window.canonicalLaunch; await c.ready(); const launch = (await c.readLaunch()).value!;
    const selected = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!, publication = await c.publish();
    const request = c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...publication.ref }, previousSelection: { ...selected.ref } });
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await c.executePublicationRenewal(request); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const after = await c.dump(), retained = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value;
    const retry = await c.executePublicationRenewal(request), exact = await c.executePublicationRenewal(request);
    return { before, after, selected, retained, error, retry, exact };
  }, store);
  expect(r.error).toContain('QuotaExceededError'); expect(r.after).toEqual(r.before); expect(r.retained).toEqual(r.selected);
  expect(r.retry.replayed).toBe(false); expect(r.exact.replayed).toBe(true); expect(r.exact.receipt).toEqual(r.retry.receipt);
});

test('renewal at normal quota exhaustion preserves selection and funded Stop', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const launch = (await c.readLaunch()).value!;
    const selected = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!, publication = await c.publish();
    await c.fillNormalCapacity(); const before = await c.dump();
    const error = await c.executePublicationRenewal(c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...publication.ref }, previousSelection: { ...selected.ref } })).catch(String);
    const after = await c.dump(), retained = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value;
    const stopped = await c.stop(); await c.ack(stopped.request.attemptId);
    return { before, after, selected, retained, error, guard: (await c.readLaunch()).value!.guard };
  });
  expect(String(r.error)).toContain('quota exhausted'); expect(r.after).toEqual(r.before); expect(r.retained).toEqual(r.selected);
  expect(r.guard.state).toBe('acknowledged');
});

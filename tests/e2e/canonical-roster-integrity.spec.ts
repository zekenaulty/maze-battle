import { test, expect } from './canonical-test';

test('a stale secondary index cannot resurrect stock or award duplicate sale proceeds', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; await r.seed('town');
    await r.edit(s => ({ ...s, inventory: { ...s.inventory, items: s.inventory.items.map(item => item.id === 'health-herb' ? { ...item, quantity: 8 } : item) } }));
    const old = (await c.readCanonical(p => p.get('world', 'roster/item/health-herb'))).value!;
    await r.act({ kind: 'sell', itemId: 'health-herb', amount: 3 });
    const balance = (await c.readCanonical(p => p.get('world', 'roster/pack'))).value;
    await r.corruptIndexPointer(old.indexes[0], old.id);
    const before = await c.dump(); let error = '';
    try { await r.act({ kind: 'sell', itemId: 'health-herb', amount: 3 }); } catch (e) { error = String(e); }
    return { error, unchanged: before.content === (await c.dump()).content, balance, after: (await c.readCanonical(p => p.get('world', 'roster/pack'))).value };
  });
  expect(result.error).toContain('index references a superseded record'); expect(result.unchanged).toBe(true); expect(result.after).toEqual(result.balance);
});

test('the command facade validates accessor-bearing requests before cloning or dispatch', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; const { head } = await r.seed('town');
    const request = c.command(head, 'roster.command', { kind: 'sell', itemId: 'health-herb', amount: 1 }); let calls = 0;
    Object.defineProperty(request, 'operation', { enumerable: true, get: () => ++calls === 1 ? 'roster.command' : 'other.operation' });
    const before = await c.dump(); let error = '';
    try { await r.executeRosterCommand(request); } catch (e) { error = String(e); }
    return { error, calls, unchanged: before.content === (await c.dump()).content };
  });
  expect(result.error).toContain('invalid JSON'); expect(result.calls).toBe(0); expect(result.unchanged).toBe(true);
});

test('the general canonical scan checks current primary identity without breaking old snapshots', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; let { head } = await c.initializeCanonical('owner', {});
    await c.executeCanonical(c.command(head), async tx => { await tx.pages.set('world', 'test', { value: 'old' }, ['test-index']); return null; });
    head = (await c.readCanonicalHead()).head; const snapshot = c.snapshotOf(head);
    const old = (await c.readCanonical(p => p.get('world', 'test'))).value!;
    await c.executeCanonical(c.command(head), async tx => { await tx.pages.set('world', 'test', { value: 'new' }, ['test-index']); return null; });
    await r.corruptIndexPointer('test-index', old.id);
    let error = ''; try { await c.readCanonical(p => p.scan('world', 'test-index')); } catch (e) { error = String(e); }
    const previous = (await c.readCanonical(p => p.scan('world', 'test-index'), { snapshot })).value;
    return { error, previous: previous.rows[0].value };
  });
  expect(result.error).toContain('index references a superseded record'); expect(result.previous).toEqual({ value: 'old' });
});

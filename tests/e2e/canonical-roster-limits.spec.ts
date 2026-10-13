import { test, expect } from './canonical-test';

test('quota failure cannot consume a sold item or award gold', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster;
    await r.seed('town', [], { limitBytes: 512 * 1024, reserveBytes: 256 * 1024 });
    let full = false;
    for (let i = 0; i < 1024; i++) {
      const { head } = await c.readCanonicalHead();
      try { await c.executeCanonical(c.command(head, 'fixture.fill'), async () => null); }
      catch (e) { if (!String(e).includes('quota exhausted')) throw e; full = true; break; }
    }
    const before = await c.dump(); let error = '';
    try { await r.act({ kind: 'sell', itemId: 'health-herb', amount: 1 }); } catch (e) { error = String(e); }
    return { full, error, unchanged: before.content === (await c.dump()).content };
  });
  expect(result.full).toBe(true); expect(result.error).toContain('quota exhausted'); expect(result.unchanged).toBe(true);
});

test('over-limit roster initialization aborts the entire new world instead of trimming stock', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; await (await c.openCanonicalDatabase()).close();
    const before = await c.dump(); let error = '';
    try { await r.seed('town', Array.from({ length: 254 }, (_, i) => ({ ...r.createItemInstance('rusty-sword', 1), id: `sword-${i}` }))); }
    catch (e) { error = String(e); }
    return { error, unchanged: before.content === (await c.dump()).content };
  });
  expect(result.error).toContain('bounded item container'); expect(result.unchanged).toBe(true);
});

test('a bounded party read does not hydrate inventory, stash or world geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; await r.seed('town');
    const { head } = await c.readCanonicalHead();
    await c.executeCanonical(c.command(head), async tx => {
      // Deliberately unavailable unrelated records must not be read by a party query.
      await tx.pages.delete('world', 'roster/pack'); await tx.pages.delete('world', 'dungeon/1'); return {};
    });
    const meter = c.storageProbe(); const party = await c.readCanonical(pages => r.loadParty(pages));
    return { party: party.value, work: party.stats, native: meter.finish() };
  });
  expect(result.party).toHaveLength(3); expect(result.work.reads).toBeLessThan(60);
  expect(result.native.operations.filter(op => op.store === 'records')).toHaveLength(4);
  expect(result.native.operations.some(op => ['put', 'add', 'getAll'].includes(op.method))).toBe(false);
});

for (const depth of [1, 16]) test(`a single sale with ${depth} retained floors writes only changed roster records`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async depth => {
    const c = window.canonical, r = c.roster; await r.seed('town'); await c.world.finishFloor();
    for (let n = 2; n <= depth; n++) await c.world.nextFloor(n);
    const { head } = await c.readCanonicalHead(), request = c.command(head, 'roster.command', { kind: 'sell', itemId: 'health-herb', amount: 1 });
    const before = await navigator.storage.estimate(), meter = c.storageProbe(), started = performance.now();
    const outcome = await r.executeRosterCommand(request), elapsedMs = performance.now() - started, native = meter.finish();
    const recordKeys: string[] = [];
    const db = await c.openCanonicalDatabase();
    try {
      const rows = await db.getAll('records');
      for (const row of rows) if (row.revision === outcome.receipt.afterRevision) recordKeys.push(row.key);
    } finally { db.close(); }
    return { depth, work: outcome.stats, elapsedMs, native, recordKeys,
      browserStorageEstimate: { before: before.usage, after: (await navigator.storage.estimate()).usage },
      note: 'Native canonical roster command using shared selling rules; not full App movement or physical disk I/O.' };
  }, depth);
  await info.attach(`roster-depth-${depth}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.recordKeys).toEqual(['roster/pack']); // Item deletion changes its index, not an unrelated row.
  expect(result.work.readBytes).toBeLessThan(160_000); expect(result.work.writeBytes).toBeLessThan(32_000);
  expect(result.native.operations.some(op => op.method === 'getAll')).toBe(false);
});

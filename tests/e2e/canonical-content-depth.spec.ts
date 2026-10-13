import { test, expect } from './canonical-test';

for (const depth of [1, 16]) test(`collecting a floor-one quest with ${depth} qualified floors never reads or rewrites other floors`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async depth => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    for (let n = 2; n <= depth; n++) { await c.world.nextFloor(n); await c.content.prepare(n); }
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    const head = (await c.readCanonicalHead()).head;
    const request = c.command(head, 'content.command', { kind: 'open-chest', chestId: t.room.chestId! });
    const keys: string[] = [], writes: string[] = [];
    const before = await navigator.storage.estimate(), meter = c.storageProbe(), started = performance.now();
    const outcome = await c.executeCanonical(request, async tx => {
      const get = tx.pages.get.bind(tx.pages), set = tx.pages.set.bind(tx.pages), scan = tx.pages.scan.bind(tx.pages);
      tx.pages.get = (area, key) => { keys.push(key); return get(area, key); };
      tx.pages.scan = (area, prefix, after, limit) => { keys.push(`index/${prefix}`); return scan(area, prefix, after, limit); };
      tx.pages.set = (area, key, value, indexes) => { writes.push(key); return set(area, key, value, indexes); };
      return c.content.commitContentCommand(tx, request.input);
    });
    const elapsedMs = performance.now() - started, native = meter.finish();
    return { depth, work: outcome.stats, elapsedMs, native, keys, writes,
      browserStorageEstimate: { before: before.usage, after: (await navigator.storage.estimate()).usage },
      note: 'Canonical explicit chest/quest transaction, not full App navigation or physical disk writes.' };
  }, depth);
  await info.attach(`content-depth-${depth}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.keys.some(key => /^dungeon\/(?!1(?:\/|$))/.test(key))).toBe(false);
  expect(result.keys.filter(key => key.startsWith('index/')).every(key => /^index\/roster\/items\/(pack|stash)\/$/.test(key))).toBe(true);
  expect(result.writes.every(key => key.startsWith('roster/') || key.startsWith('quest/') || key.startsWith('dungeon/1/chest/'))).toBe(true);
  expect(result.native.operations.some(op => ['getAll', 'getAllKeys'].includes(op.method))).toBe(false);
  expect(result.work.readBytes).toBeLessThan(160_000); expect(result.work.writeBytes).toBeLessThan(64_000);
});

test('bounded contract/status pages keep historical snapshots and exclude already opened fetch offers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, targets = await c.content.seed(), t = targets.find(t => t.chest)!;
    const snapshot = c.snapshotOf((await c.readCanonicalHead()).head);
    const before = await c.readCanonical(p => c.content.listFloorContracts(p, 1, undefined, 2));
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
    const after = await c.readCanonical(p => c.content.listFloorContracts(p, 1, undefined, 16));
    const historical = await c.readCanonical(p => c.content.listFloorContracts(p, 1, undefined, 16), { snapshot });
    const second = targets.find(t => t.chest && t.room.contractId !== targets.find(t => t.chest)!.room.contractId)!;
    await c.content.act({ kind: 'accept-quest', contractId: second.room.contractId! });
    const active = await c.readCanonical(p => c.content.listFloorQuests(p, 1, 'active', undefined, 1));
    return { before: before.value, after: after.value, historical: historical.value, active: active.value, target: t.room.contractId };
  });
  expect(result.before.contracts).toHaveLength(2); expect(result.before.next).toBeTruthy();
  expect(result.after.contracts.some(c => c.id === result.target)).toBe(false);
  expect(result.historical.contracts.some(c => c.id === result.target)).toBe(true);
  expect(result.active.quests).toHaveLength(1); expect(result.active.quests[0].status).toBe('active');
});

test('logical quota exhaustion aborts quest loot without partial publication', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.roster.seed('manual', [], { limitBytes: 2 * 1024 * 1024, reserveBytes: 256 * 1024 });
    await c.content.prepare(); const t = (await c.content.targets()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    const { head } = await c.readCanonicalHead(), db = await c.openCanonicalDatabase();
    // Test-only quota ceiling adjustment avoids thousands of irrelevant filler receipts.
    const changed = { ...head, quota: { ...head.quota, limitBytes: head.quota.usedBytes + head.quota.reserveBytes + 1 } };
    await db.put('heads', changed, head.gameId); db.close();
    const before = (await c.dump()).content; let error = '';
    try { await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! }); } catch (e) { error = String(e); }
    return { error, before, after: (await c.dump()).content };
  });
  expect(result.error).toContain('quota exhausted'); expect(result.after).toEqual(result.before);
});

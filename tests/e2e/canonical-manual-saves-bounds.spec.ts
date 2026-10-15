import { expect, test } from './canonical-manual-saves.test';

test('native save I/O stays bounded after 1024 retained world records; only execution metadata is added', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed();
    const small = await c.create(), smallLoad = await c.act({ kind: 'load', id: small.id });
    await c.act({ kind: 'delete', id: small.id });
    for (let batch = 0; batch < 32; batch++) await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.history'), async tx => {
      for (let i = 0; i < 32; i++) await tx.pages.set('world', `history/${batch * 32 + i}`, { payload: 'w'.repeat(1024) });
      return batch;
    });
    const db = await c.openCanonicalDatabase(), before = await db.getAll('records'); db.close();
    const probe = c.storageProbe(), large = await c.create(), list = await c.listManualSaves();
    const load = await c.act({ kind: 'load', id: large.id }), io = probe.finish();
    const afterDb = await c.openCanonicalDatabase(), after = await afterDb.getAll('records'); afterDb.close();
    const ids = new Set(before.map(r => r.id));
    return { small: small.outcome.stats, smallLoad: smallLoad.outcome.stats, large: large.outcome.stats, load: load.outcome.stats, io, list,
      added: after.filter(r => !ids.has(r.id)), kept: after.filter(r => ids.has(r.id)).length, original: before.length };
  });
  expect(result.large.reads).toBeLessThan(result.small.reads + 16);
  expect(result.large.writeBytes).toBeLessThan(result.small.writeBytes + 4096);
  expect(result.load.reads).toBeLessThan(result.smallLoad.reads + 16);
  expect(result.load.readBytes).toBeLessThan(result.smallLoad.readBytes + 16384);
  expect(result.load.writeBytes).toBeLessThan(4096); expect(result.load.writes).toBe(2);
  expect(result.added).toHaveLength(2); expect(result.added.every(r => r.area === 'execution')).toBe(true);
  expect(JSON.stringify(result.added).length).toBeLessThan(8192); expect(result.kept).toBe(result.original);
  expect(result.list).toHaveLength(1);
  expect(result.io.operations.every(op => !['getAll', 'getAllKeys', 'count'].includes(op.method))).toBe(true);
});

test('restored observation anchor is exact and later observations fork without overwriting historical evidence', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); await c.prepareWorld();
    const observe = async () => c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.observe'), async tx => {
      tx.setCheckpoint(c.roster.checkpointJson(await c.recordGameObservation(tx, c.roster.gameCheckpoint(tx.head.checkpoint)))); return true;
    });
    await observe(); const first = (await c.readCanonicalHead()).head, save = await c.create();
    await observe(); const second = (await c.readCanonicalHead()).head;
    await c.act({ kind: 'load', id: save.id });
    const restored = await c.readCanonical(async (p, s) => {
      const checkpoint = c.roster.gameCheckpoint(s.checkpoint); await c.validateKnowledge(p, checkpoint.knowledge);
      return c.loadObservation(p, { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id });
    });
    await observe(); const fork = await c.readCanonical(async (p, s) => {
      const checkpoint = c.roster.gameCheckpoint(s.checkpoint); await c.validateKnowledge(p, checkpoint.knowledge); return checkpoint;
    });
    const historical = await c.readCanonical(async (p, s) => {
      const checkpoint = c.roster.gameCheckpoint(s.checkpoint); await c.validateKnowledge(p, checkpoint.knowledge); return checkpoint;
    }, { snapshot: c.snapshotOf(second) });
    return { first, second, restored, fork, historical };
  });
  expect(result.restored.head.checkpoint.knowledge).toEqual(result.first.checkpoint.knowledge);
  expect(result.restored.value.header.sequence).toBe(1);
  expect(result.fork.value.knowledge?.sequence).toBe(2);
  expect(result.fork.value.knowledge?.id).not.toBe(result.historical.value.knowledge?.id);
  expect(result.historical.value.knowledge).toEqual(result.second.checkpoint.knowledge);
});

test('a restore cannot share admission of a newly funded operation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const save = await c.create(), before = await c.dump();
    const request = c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: 'pending', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES });
    const error = await c.operateCanonical(request, 'admit', async tx => { await tx.restoreSnapshot(`manual-saves/snapshot/${save.id}`); return true; }).catch(String);
    return { error, before, after: await c.dump() };
  });
  expect(result.error).toContain('cannot mix'); expect(result.after).toEqual(result.before);
});

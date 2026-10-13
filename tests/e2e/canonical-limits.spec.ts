import { expect, test } from './canonical-test';

for (const action of ['stop', 'takeover'] as const) test(`logical capacity preserves a bounded ${action} with exact replay`, async ({ page }) => {
  const result = await page.evaluate(async action => {
    const c = window.canonical;
    await c.initializeCanonical('owner', {}, undefined, { quota: { limitBytes: 80_000, reserveBytes: 65_536 } });
    let rejected = '', admitted = 0;
    for (let i = 0; i < 100; i++) {
      const head = (await c.readCanonicalHead()).head;
      try { await c.executeCanonical(c.command(head), async tx => { await tx.pages.set('world', 'test', { i }); return i; }); admitted++; }
      catch (error) { rejected = String(error); break; }
    }
    const before = await c.dump(), current = (await c.readCanonicalHead()).head;
    const owner = action === 'takeover' ? 'recovery-owner' : 'owner', command = c.command(current, `control.${action}`, { owner });
    const stopped = await c.controlCanonical(command, action), after = await c.dump();
    const replay = await c.controlCanonical(command, action), repeated = await c.controlCanonical(c.command((await c.readCanonicalHead()).head, `control.${action}`, { owner }), action).catch(String);
    const newWork = await c.executeCanonical(c.command((await c.readCanonicalHead()).head), async () => { throw Error('must not run'); }).catch(String);
    return { rejected, admitted, before, after, stopped, replay, repeated, newWork, head: (await c.readCanonicalHead()).head };
  }, action);
  expect(result.admitted).toBeGreaterThan(1); expect(result.rejected).toContain('storage quota');
  expect(result.head.status).toBe('stopped'); expect(result.head.quota.usedBytes).toBe(result.after.bytes);
  expect(result.after.bytes).toBeGreaterThan(result.before.bytes); expect(result.after.bytes).toBeLessThan(80_000);
  expect(result.replay.receipt).toEqual(result.stopped.receipt); expect(result.repeated).toContain('already applied');
  expect(result.newWork).toContain('stopped');
});

test('staged superseded rows are not stored and indexed pages stay bounded', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {});
    await c.executeCanonical(c.command(head), async tx => {
      for (let i = 0; i < 20; i++) await tx.pages.set('world', 'a', i, ['list/a']);
      await tx.pages.set('world', 'discarded', true, ['list/discarded']); await tx.pages.delete('world', 'discarded');
      return 19;
    });
    const db = await c.openCanonicalDatabase(), count = await db.count('records'); db.close();
    const rejected = await c.listCanonical('world', 'list/', 65).catch(String);
    return { count, rejected, page: (await c.listCanonical('world', 'list/', 1)).value, head: (await c.readCanonicalHead()).head, dump: await c.dump() };
  });
  expect(result.count).toBe(1); expect(result.rejected).toContain('Invalid');
  expect(result.page.rows.map(r => r.value)).toEqual([19]); expect(result.head.quota.usedBytes).toBe(result.dump.bytes);
});

test('request, checkpoint and record values are captured before asynchronous reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), command = c.command(head, 'captured', { before: true });
    const pending = c.executeCanonical(command, async tx => {
      const value = { before: true }, checkpoint = { before: true }, indexes = ['list/original'];
      const write = tx.pages.set('world', 'a', value, indexes);
      value.before = false; indexes[0] = 'list/mutated'; tx.setCheckpoint(checkpoint); checkpoint.before = false;
      await write; return 'captured';
    });
    command.input = null; command.expected.owner = 'changed';
    const committed = await pending;
    return { committed, record: (await c.readCanonical(p => p.get('world', 'a'))).value, head: (await c.readCanonicalHead()).head };
  });
  expect(result.record).toMatchObject({ value: { before: true }, indexes: ['list/original'] });
  expect(result.head.checkpoint).toEqual({ before: true }); expect(result.committed.receipt.fingerprint).toContain('"before":true');
});

for (const depth of [1, 128, 2048]) test(`kernel point reads and incremental writes with ${depth} retained floor records`, async ({ page }, info) => {
  const result = await page.evaluate(async depth => {
    const c = window.canonical;
    let current = (await c.initializeCanonical('owner', { floorId: 'floor-0', x: 0 })).head;
    for (let offset = 0; offset < depth; offset += 32) {
      await c.executeCanonical(c.command(current, 'fixture.seed'), async tx => {
        for (let i = offset; i < Math.min(depth, offset + 32); i++) {
          await tx.pages.set('world', `floor-${i}`, { seed: i, geometry: 'x'.repeat(1024) }, [`floor/${String(i).padStart(8, '0')}`]);
        }
        return null;
      });
      current = (await c.readCanonicalHead()).head;
    }
    const samples = [], before = await navigator.storage.estimate();
    const getAll = IDBObjectStore.prototype.getAll, cursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.getAll = function () { throw Error('Unbounded getAll forbidden'); };
    IDBObjectStore.prototype.openCursor = function () { throw Error('Unbounded cursor forbidden'); };
    try {
      for (let i = 0; i < 6; i++) {
        const meter = c.storageProbe(), started = performance.now();
        const changed = await c.executeCanonical(c.command(current, 'fixture.step', { x: i }), async tx => {
          const floor = await tx.pages.get('world', 'floor-0'); if (!floor) throw Error('Missing active floor');
          await tx.pages.set('world', 'mutation/room-0', { visits: i }, ['space/room-0/mutation']);
          tx.setCheckpoint({ floorId: 'floor-0', x: i }); return { x: i };
        });
        samples.push({ elapsedMs: performance.now() - started, work: changed.stats, native: meter.finish() });
        current = (await c.readCanonicalHead()).head;
      }
      const meter = c.storageProbe(), started = performance.now();
      const headRead = await c.readCanonicalHead(), refresh = { elapsedMs: performance.now() - started, ...meter.finish(), work: headRead.stats };
      const distant = await c.readCanonical(pages => pages.get('world', `floor-${depth - 1}`));
      return { depth, samples, refresh, distantReads: distant.stats, headBytes: new TextEncoder().encode(JSON.stringify(current)).length,
        quota: current.quota, browserStorageEstimate: { before: before.usage, after: (await navigator.storage.estimate()).usage },
        note: 'Synthetic kernel floor records, NOT actual RPG movement. Native JSON payload bytes are not physical disk writes; work counts include staged/discarded work.' };
    } finally { IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.openCursor = cursor; }
  }, depth);
  await info.attach(`kernel-depth-${depth}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.headBytes).toBeLessThan(1024); expect(result.refresh.work.reads).toBe(2);
  expect(result.refresh.work.readBytes).toBeLessThan(2048); expect(result.distantReads.readBytes).toBeLessThan(32_768);
  for (const sample of result.samples) {
    expect(sample.work.reads).toBeLessThan(80); expect(sample.work.readBytes).toBeLessThan(65_536);
    expect(sample.work.writeBytes).toBeLessThan(32_768);
  }
});

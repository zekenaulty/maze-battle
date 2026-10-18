import { test, expect } from './canonical-test';

for (const phase of ['admitted', 'settled']) test(`reset preserves ${phase} verified-host obligations without staging or scanning history`, async ({ page }) => {
  const r = await page.evaluate(async phase => {
    const c = window.canonical; let head = (await c.initializeCanonical('owner', {}, async p => { await p.set('knowledge', 'broken', 1); })).head;
    await c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'opaque-id', binding: {},
      terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }), 'admit', async () => null);
    head = (await c.readCanonicalHead()).head;
    if (phase === 'settled') await c.operateCanonical(c.command(head, 'operation.cancel', { operationId: 'opaque-id' }), 'cancel');
    const db = await c.openCanonicalDatabase(); await db.clear('records'); await db.clear('nodes'); db.close();
    const before = await c.dump(), meter = c.storageProbe(); let seeded = false;
    const error = await c.resetCanonical('replacement', {}, async () => { seeded = true; }).then(() => '', String);
    const proof = meter.finish(); return { error, seeded, proof, before, after: await c.dump() };
  }, phase);
  expect(r.error).toContain('unresolved verified-host obligation'); expect(r.seeded).toBe(false); expect(r.after).toEqual(r.before);
  expect(r.proof.operations.every(o => o.method === 'get' && ['meta', 'heads', 'operations', 'receipts'].includes(o.store))).toBe(true);
  expect(r.proof.transactions).toHaveLength(1); expect(r.proof.transactions[0]).toMatchObject({ mode: 'readwrite', outcome: 'abort' });
});

test('reset bounds current allocation reads without traversing history', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonical; await c.initializeCanonical('owner', {});
    for (let i = 0; i < 16; i++) {
      const { head } = await c.readCanonicalHead();
      await c.operateCanonical(c.command(head, 'operation.admit', { operationId: `local-${i}`, binding: {},
        terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => null);
    }
    const meter = c.storageProbe(), reset = await c.resetCanonical('replacement', {}), proof = meter.finish();
    return { reset, proof };
  });
  expect(r.reset.stats.reads).toBe(34); expect(r.reset.head.allocations).toEqual({});
  const reads = r.proof.operations.filter(o => o.method === 'get');
  expect(reads).toHaveLength(34); expect(reads.every(o => ['meta', 'heads', 'operations', 'receipts'].includes(o.store))).toBe(true);
  expect(r.proof.transactions).toHaveLength(1); expect(r.proof.transactions[0]).toMatchObject({ mode: 'readwrite', outcome: 'complete' });
});

for (const version of [0, 8]) test(`explicit reset can discard an empty or obsolete schema (${version}) without reading old data`, async ({ page }) => {
  const r = await page.evaluate(async version => {
    const c = window.canonical;
    if (version) await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('maze-battle', version);
      request.onupgradeneeded = () => request.result.createObjectStore('obsolete').put('old-sentinel', 'old');
      request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
    const get = IDBObjectStore.prototype.get, reads: string[] = [];
    IDBObjectStore.prototype.get = function (...args) {
      if (this.transaction.mode === 'versionchange' || this.transaction.db.version < 9) {
        reads.push(this.name); throw Error('Old schema was read');
      }
      return get.apply(this, args);
    };
    try { return { fresh: (await c.resetCanonical('replacement', {})).head, reads, dump: await c.dump() }; }
    finally { IDBObjectStore.prototype.get = get; }
  }, version);
  expect(r.reads).toEqual([]); expect(r.fresh.allocations).toEqual({}); expect(r.dump.content).not.toContain('old-sentinel');
});

test('reset ignores damaged unallocated history without inferring policy from IDs', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {});
    await c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'agentica-launch:local', binding: { kind: 'agentica-launch' },
      terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => null);
    const stopped = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'agentica-launch:local' }), 'cancel');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: 'agentica-launch:local', terminalAttemptId: stopped.receipt.attemptId }), 'acknowledge');
    const db = await c.openCanonicalDatabase(); await db.clear('receipts');
    await db.put('operations', { corrupt: true } as never, [head.gameId, 'unallocated-history']); db.close();
    const reset = await c.resetCanonical('replacement', {}); return { reset, old: head.generation };
  });
  expect(r.reset.head.generation).not.toBe(r.old); expect(r.reset.stats.reads).toBe(2);
});

test('read-budget failure cannot clear the game', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonical; await c.initializeCanonical('owner', {}); const before = await c.dump();
    const error = await c.resetCanonical('replacement', {}, undefined, { limits: { reads: 1, writes: 512, bytes: 65536 } }).catch(String);
    return { error, before, after: await c.dump() };
  });
  expect(r.error).toContain('read budget exhausted'); expect(r.after).toEqual(r.before);
});

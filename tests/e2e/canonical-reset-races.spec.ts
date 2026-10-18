import { test, expect } from './canonical-test';

for (const first of ['admission', 'reset']) test(`${first} queued first determines the reset/admission outcome atomically`, async ({ page }) => {
  const r = await page.evaluate(async first => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), db = await c.openCanonicalDatabase();
    // The observed empty allocation set is deliberately stale by the time reset runs in one ordering.
    const observed = (await c.readCanonicalHead()).head.allocations;
    const hold = db.transaction(['meta', 'heads'], 'readwrite'); let release = false;
    const holding = (async () => { while (!release) await hold.objectStore('meta').get('schema'); await hold.done; })();
    const transaction = IDBDatabase.prototype.transaction; let queued!: () => void;
    const firstQueued = new Promise<void>(resolve => { queued = resolve; });
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      const tx = transaction.apply(this, args);
      if (args[1] === 'readwrite') { IDBDatabase.prototype.transaction = transaction; queued(); }
      return tx;
    };
    let admitted = false;
    const admission = () => c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'pending', binding: {},
      terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }), 'admit', async () => { admitted = true; return null; }).then(() => 'committed', String);
    const reset = () => c.resetCanonical('replacement', {}).then(() => 'committed', String);
    try {
      const firstWork = first === 'admission' ? admission() : reset(); await firstQueued;
      const secondWork = first === 'admission' ? reset() : admission();
      release = true; await holding;
      const results = [await firstWork, await secondWork], current = (await c.readCanonicalHead()).head;
      return { observed, results, admitted, old: head, current };
    } finally { release = true; IDBDatabase.prototype.transaction = transaction; await holding; db.close(); }
  }, first);
  expect(r.observed).toEqual({}); expect(r.results[0]).toBe('committed');
  if (first === 'admission') {
    expect(r.results[1]).toContain('unresolved verified-host obligation');
    expect(r.current.generation).toBe(r.old.generation); expect(r.current.allocations).toHaveProperty('pending');
  } else {
    expect(r.results[1]).toContain('game generation changed'); expect(r.admitted).toBe(false);
    expect(r.current.generation).not.toBe(r.old.generation); expect(r.current.allocations).toEqual({});
  }
});

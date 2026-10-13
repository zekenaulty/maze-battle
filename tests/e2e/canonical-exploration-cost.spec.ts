import { test, expect } from './canonical-test';

test('ordinary step reads and writes only local records at one and sixteen retained floors', async ({ page }, info) => {
  test.setTimeout(120_000);
  const samples = [];
  for (const floors of [1, 16]) {
    await page.reload(); await page.waitForFunction(() => !!window.canonical);
    const result = await page.evaluate(async floors => {
      await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('maze-battle');
        request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('Fixture reset blocked')); });
      const c = window.canonical; await c.knowledge.seed();
      for (let level = 2; level <= floors; level++) { await c.world.nextFloor(level); await c.content.prepare(level); }
      const head = (await c.readCanonicalHead()).head, beforeStorage = await navigator.storage.estimate();
      const request = c.command(head, 'exploration.command', { kind: 'move', direction: 'east', triggerStairs: false });
      const readKeys: string[] = [], writeKeys: string[] = [], restores: (() => void)[] = [];
      for (const method of ['get', 'add'] as const) {
        const original = IDBObjectStore.prototype[method];
        const replacement = function(this: IDBObjectStore, ...args: unknown[]) {
          const req = Reflect.apply(original, this, args) as IDBRequest;
          if (this.name === 'records') {
            if (method === 'add') writeKeys.push((args[0] as { key: string }).key);
            else req.addEventListener('success', () => { if (req.result) readKeys.push(req.result.key); }, { once: true });
          }
          return req;
        };
        Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: replacement });
        restores.push(() => Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: original }));
      }
      const meter = c.storageProbe(), started = performance.now();
      const step = await c.knowledge.executeExplorationCommand(request), elapsedMs = performance.now() - started, native = meter.finish();
      for (const restore of restores.reverse()) restore();
      const afterStorage = await navigator.storage.estimate();
      return { floors, stats: step.stats, elapsedMs, beforeUsage: beforeStorage.usage, afterUsage: afterStorage.usage,
        readKeys, writeKeys, native, result: step.receipt.result };
    }, floors);
    samples.push(result);
    expect(result.result).toMatchObject({ moved: true });
    expect(result.native.operations.some(o => ['getAll', 'getAllKeys', 'clear'].includes(o.method))).toBe(false);
    expect(result.readKeys.filter(k => /^dungeon\/(?!1\/|1$)\d/.test(k))).toEqual([]);
    expect(result.writeKeys.some(k => k.startsWith('dungeon/'))).toBe(false);
    expect(result.stats.reads).toBeLessThan(350); expect(result.stats.writes).toBeLessThan(150);
    expect(result.stats.writeBytes).toBeLessThan(150_000);
  }
  expect(samples[1].stats.reads).toBeLessThan(samples[0].stats.reads + 40);
  expect(samples[1].stats.writeBytes).toBeLessThan(samples[0].stats.writeBytes + 10_000);
  await info.attach('local-step-native-io.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

test('repeat sight retains unchanged memory blocks and exact prior source observations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const before = await c.readCanonical(p => p.witness('knowledge', 'perception/cell/'));
    const head = (await c.readCanonicalHead()).head, observation = c.roster.gameCheckpoint(head.checkpoint).knowledge!;
    const original = (await c.readCanonical(p => c.knowledge.loadObservation(p, { id: observation.id, sequence: observation.sequence }))).value;
    await c.knowledge.act({ kind: 'look' });
    return { before: before.value, after: (await c.readCanonical(p => p.witness('knowledge', 'perception/cell/'))).value,
      original, retained: (await c.readCanonical(p => c.knowledge.loadObservation(p, { id: observation.id, sequence: observation.sequence }))).value,
      view: (await c.knowledge.read([original.header.actor])).value };
  });
  expect(result.after).toBe(result.before); expect(result.retained).toEqual(result.original);
  expect(result.view[0].state).toBe('visible'); expect(result.view[0].cell?.source.sequence).toBe(1);
});

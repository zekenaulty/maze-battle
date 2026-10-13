import { expect, test } from './canonical-test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('browser reload reconciles the original attempt without repeating the effect', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), command = c.command(head);
    const result = await c.executeCanonical(command, async tx => { await tx.pages.set('world', 'item', { quantity: 1 }); return 1; });
    return { command: JSON.stringify(command), receipt: result.receipt, dump: await c.dump() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async command => {
    const c = window.canonical, replay = await c.executeCanonical(JSON.parse(command) as CanonicalRequest, async () => { throw Error('duplicate'); });
    return { replay, dump: await c.dump() };
  }, saved.command);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(saved.receipt); expect(result.dump).toEqual(saved.dump);
});

test('read cap is checked before the next native request, not after it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), meter = c.storageProbe();
    const error = await c.executeCanonical(c.command(head), async () => null, { limits: { reads: 1, writes: 512, bytes: 65_536 } }).catch(String);
    return { error, meter: meter.finish() };
  });
  expect(result.error).toContain('read budget exhausted');
  expect(result.meter.operations.filter(o => o.method === 'get').map(o => o.store)).toEqual(['meta']);
});

test('a writer queued behind reset cannot publish its old generation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), db = await c.openCanonicalDatabase();
    const hold = db.transaction(['meta', 'heads'], 'readwrite'); let release = false;
    const holding = (async () => { while (!release) await hold.objectStore('meta').get('schema'); await hold.done; })();
    let called = false;
    const resetting = c.resetCanonical('fresh', {});
    const stale = c.executeCanonical(c.command(head), async () => { called = true; return null; }).catch(String);
    await new Promise(resolve => setTimeout(resolve, 30)); release = true;
    await holding; const reset = await resetting, old = await stale; db.close();
    return { called, old, reset: reset.head, current: (await c.readCanonicalHead()).head };
  });
  expect(result.called).toBe(false); expect(result.old).toContain('generation changed'); expect(result.current).toEqual(result.reset);
});

test('an expired original request still reconciles its committed receipt, but not different input', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), command = c.command(head);
    command.deadlineAt = Date.now() + 60_000;
    const first = await c.executeCanonical(command, async () => 1), now = Date.now;
    Date.now = () => command.deadlineAt! + 1;
    try {
      return { first, replay: await c.executeCanonical(command, async () => { throw Error('duplicate'); }),
        altered: await c.executeCanonical({ ...command, input: { different: true } }, async () => 2).catch(String) };
    } finally { Date.now = now; }
  });
  expect(result.replay.receipt).toEqual(result.first.receipt); expect(result.altered).toContain('invalid original receipt');
});

test('cancelled database open never starts an upgrade', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const signal = new AbortController(); signal.abort();
    const error = await window.canonical.openCanonicalDatabase(signal.signal).catch(String);
    const databases = await indexedDB.databases();
    return { error, databases };
  });
  expect(result.error).toContain('AbortError'); expect(result.databases.some(db => db.name === 'maze-battle')).toBe(false);
});

test('read snapshots reject extra fields rather than overriding control or quota metadata', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {});
    const snapshot = { ...c.snapshotOf(head), owner: 'fake-owner' };
    return await c.readCanonical(async () => null, { snapshot }).catch(String);
  });
  expect(result).toContain('invalid snapshot fields');
});

test('an initializer yielding outside IDB cannot commit reset clears on their own', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    await c.initializeCanonical('owner', { original: true }, async pages => { await pages.set('world', 'a', 1); });
    const before = await c.dump();
    const error = await c.resetCanonical('replacement', {}, async pages => {
      await new Promise(resolve => setTimeout(resolve, 30));
      await pages.set('world', 'new', 2);
    }).catch(String);
    return { error, before, after: await c.dump() };
  });
  expect(result.error).toMatch(/(TransactionInactive|InvalidState)Error/); expect(result.after).toEqual(result.before);
});

test('caught missing-record reads cannot be published as a successful fallback', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    await c.initializeCanonical('owner', {}, async pages => { await pages.set('world', 'a', 1); });
    const db = await c.openCanonicalDatabase(); await db.clear('records'); db.close();
    let caught = '';
    const error = await c.readCanonical(async pages => {
      try { await pages.get('world', 'a'); } catch (cause) { caught = String(cause); }
      return 'not actually recovered';
    }).catch(String);
    return { error, caught };
  });
  expect(result.caught).toContain('missing referenced record'); expect(result.error).toContain('read view is not usable');
});

for (const method of ['write', 'reset', 'read']) test(`${method} captures cancellation before asynchronous database opening`, async ({ page }) => {
  const result = await page.evaluate(async method => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}), db = await c.openCanonicalDatabase();
    const hold = db.transaction(['meta', 'heads'], 'readwrite'); let release = false;
    const holding = (async () => { while (!release) await hold.objectStore('meta').get('schema'); await hold.done; })();
    const original = new AbortController(), replacement = new AbortController(), options = { signal: original.signal };
    let finished = false;
    const pending = (method === 'write' ? c.executeCanonical(c.command(head), async () => null, options)
      : method === 'reset' ? c.resetCanonical('replacement', {}, undefined, options)
        : c.readCanonical(async () => null, options)).then(() => 'unexpected success', String).then(result => { finished = true; return result; });
    options.signal = replacement.signal;
    await new Promise(resolve => setTimeout(resolve, 20)); original.abort();
    await new Promise(resolve => setTimeout(resolve, 20)); const cancelledWhileBlocked = finished;
    release = true; await holding; const error = await pending; db.close();
    return { error, cancelledWhileBlocked, head, current: (await c.readCanonicalHead()).head };
  }, method);
  expect(result.error).toContain('AbortError'); expect(result.cancelledWhileBlocked).toBe(true); expect(result.current).toEqual(result.head);
});

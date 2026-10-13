import { expect, test } from './canonical-manual-saves.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('explicit claim recovers foreign stopped custody after reload without touching game state', async ({ page }) => {
  const stopped = await page.evaluate(async () => {
    const c = window.manualSaves, head = await c.seed();
    await c.controlCanonical(c.command(head, 'control.takeover', { owner: 'previous-session' }), 'takeover');
    return (await c.readCanonicalHead()).head;
  });
  await page.reload(); await page.waitForFunction(() => !!window.manualSaves);
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, owner = c.canonicalOwner(), before = (await c.readCanonicalHead()).head, probe = c.storageProbe();
    const claimed = await c.controlCanonical(c.command(before, 'control.claim', { owner }), 'claim'), io = probe.finish();
    const dump = await c.dump(), blocked = await c.change().catch(String);
    const resumed = await c.controlCanonical(c.command(claimed.head!, 'control.resume', { owner }), 'resume');
    return { owner, claimed, io, dump, blocked, resumed };
  });
  const head = result.claimed.head!;
  expect(head).toEqual({ ...stopped, owner: result.owner, revision: stopped.revision + 1, epoch: stopped.epoch + 1,
    quota: { ...stopped.quota, usedBytes: result.dump.bytes } });
  expect(head.status).toBe('stopped'); expect(head.quota.usedBytes).toBeGreaterThan(stopped.quota.usedBytes);
  expect(result.io.operations.filter(op => ['put', 'add'].includes(op.method)).map(op => op.store)).toEqual(['receipts', 'heads']);
  expect(result.io.operations.some(op => ['records', 'nodes', 'operations'].includes(op.store))).toBe(false);
  expect(result.blocked).toContain('stopped'); expect(result.resumed.head?.status).toBe('ready');
  expect(result.resumed.head?.owner).toBe(result.owner); expect(result.resumed.head?.epoch).toBe(head.epoch + 1);
});

test('claim replay is exact after resume/mutations/takeover; fresh stale fences and reset generations fail', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, initial = await c.seed();
    await c.controlCanonical(c.command(initial, 'control.stop', { owner: initial.owner }), 'stop');
    const stopped = (await c.readCanonicalHead()).head, request = c.command(stopped, 'control.claim', { owner: 'new' });
    const claimed = await c.controlCanonical(request, 'claim');
    const stale = await c.controlCanonical({ ...request, attemptId: 'fresh-stale' }, 'claim').catch(String);
    const oldOwner = await c.controlCanonical(c.command({ ...claimed.head!, owner: stopped.owner }, 'control.claim', { owner: 'other' }), 'claim').catch(String);
    const oldEpoch = await c.controlCanonical(c.command({ ...claimed.head!, epoch: stopped.epoch }, 'control.claim', { owner: 'other' }), 'claim').catch(String);
    await c.controlCanonical(c.command(claimed.head!, 'control.resume', { owner: 'new' }), 'resume'); await c.change(4);
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'later' }), 'takeover');
    const before = await c.dump(), replay = await c.controlCanonical(request, 'claim');
    const mismatch = await c.controlCanonical({ ...request, input: { owner: 'different' } }, 'claim').catch(String), after = await c.dump();
    await c.resetCanonical('reset', initial.checkpoint);
    const resetBefore = await c.dump(), generation = await c.controlCanonical(request, 'claim').catch(String);
    return { claimed, stale, oldOwner, oldEpoch, replay, mismatch, before, after, generation, resetBefore, resetAfter: await c.dump() };
  });
  for (const error of [result.stale, result.oldOwner, result.oldEpoch]) expect(error).toContain('stale');
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.claimed.receipt);
  expect(result.replay.stats.reads).toBe(2); expect(result.replay.stats.writes).toBe(0);
  expect(result.mismatch).toContain('invalid original receipt'); expect(result.after).toEqual(result.before);
  expect(result.generation).toContain('generation changed'); expect(result.resetAfter).toEqual(result.resetBefore);
});

test('claim is stopped-only, transfer-only, strict host control; stop/takeover remain ready-only', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, ready = await c.seed(), readyBefore = await c.dump();
    const readyError = await c.controlCanonical(c.command(ready, 'control.claim', { owner: 'new' }), 'claim').catch(String);
    const readyAfter = await c.dump(); await c.controlCanonical(c.command(ready, 'control.stop', { owner: ready.owner }), 'stop');
    const stopped = (await c.readCanonicalHead()).head, before = await c.dump(), errors = [];
    for (const action of ['stop', 'takeover'] as const) errors.push(await c.controlCanonical(c.command(stopped, `control.${action}`, { owner: stopped.owner }), action).catch(String));
    for (const input of [{ owner: stopped.owner }, {}, { owner: '' }, { owner: 'new', roots: stopped.roots }])
      try { await c.controlCanonical(c.command(stopped, 'control.claim', input as never), 'claim'); errors.push('accepted'); } catch (error) { errors.push(String(error)); }
    try { await c.controlCanonical(c.command(stopped, 'control.takeover', { owner: 'new' }), 'claim'); errors.push('accepted'); } catch (error) { errors.push(String(error)); }
    try { await c.executeCanonical(c.command(stopped, 'control.claim', { owner: 'new' }), async () => true); errors.push('accepted'); } catch (error) { errors.push(String(error)); }
    return { readyError, readyBefore, readyAfter, errors, before, after: await c.dump() };
  });
  expect(result.readyError).toContain('control already applied'); expect(result.readyAfter).toEqual(result.readyBefore);
  expect(result.errors).toHaveLength(8); expect(result.errors.every(error => String(error).startsWith('Error:'))).toBe(true);
  expect(result.after).toEqual(result.before);
});

test('repeated stopped claims exhaust only normal capacity and cannot drain recovery reserve', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, { head } = await c.initializeCanonical('owner', {}, undefined, { quota: { limitBytes: 96 * 1024, reserveBytes: 64 * 1024 } });
    await c.controlCanonical(c.command(head, 'control.takeover', { owner: 'stopped' }), 'takeover');
    let first: CanonicalRequest | undefined, error = '', count = 0, before = await c.dump();
    for (; count < 100; count++) {
      const request = c.command((await c.readCanonicalHead()).head, 'control.claim', { owner: `owner-${count}` }); before = await c.dump();
      try { await c.controlCanonical(request, 'claim'); first ??= request; } catch (cause) { error = String(cause); break; }
    }
    const after = await c.dump(), current = (await c.readCanonicalHead()).head, replay = await c.controlCanonical(first!, 'claim');
    return { count, error, before, after, current, replay, replayAfter: await c.dump() };
  });
  expect(result.count).toBeGreaterThan(1); expect(result.count).toBeLessThan(100); expect(result.error).toContain('quota exhausted');
  expect(result.after).toEqual(result.before); expect(result.replayAfter).toEqual(result.after); expect(result.replay.replayed).toBe(true);
  expect(result.current.quota.usedBytes).toBe(result.after.bytes);
  expect(result.current.quota.limitBytes - result.current.quota.usedBytes).toBeGreaterThanOrEqual(result.current.quota.reserveBytes);
});

for (const resolution of ['adopt', 'cancel']) test(`claim never adopts old operations; explicit ${resolution} is still required`, async ({ page }) => {
  const result = await page.evaluate(async resolution => {
    const c = window.manualSaves, head = await c.seed();
    await c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'old', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => true);
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'lost' }), 'takeover');
    const before = await c.readCanonical(p => p.liveOperation('old'));
    const claim = await c.controlCanonical(c.command(before.head, 'control.claim', { owner: 'reloaded' }), 'claim');
    const after = await c.readCanonical(p => p.liveOperation('old'));
    if (resolution === 'cancel') await c.operateCanonical(c.command(after.head, 'operation.cancel', { operationId: 'old' }), 'cancel');
    else {
      await c.controlCanonical(c.command(after.head, 'control.resume', { owner: 'reloaded' }), 'resume');
      const request = c.command((await c.readCanonicalHead()).head, 'operation.settle', { operationId: 'old', disposition: 'completed' });
      const error = await c.operateCanonical(request, 'settle', async () => true).catch(String);
      if (!String(error).includes('explicit adoption')) throw Error(`Unexpected settlement: ${error}`);
      await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: 'old' }), 'adopt');
      await c.operateCanonical({ ...request, expected: c.canonicalFence((await c.readCanonicalHead()).head) }, 'settle', async () => true);
    }
    return { before, after, claim, final: (await c.readCanonical(p => p.liveOperation('old'))).value };
  }, resolution);
  expect(result.after.value).toEqual(result.before.value); expect(result.after.head.allocations).toEqual(result.before.head.allocations);
  expect(result.claim.head?.quota.reservedBytes).toBe(result.before.head.quota.reservedBytes);
  expect(result.claim.head?.quota.reservations).toBe(1);
  expect(result.final?.state).toBe('settled'); expect(result.final?.owner).toBe('reloaded');
  expect(result.final?.terminal?.disposition).toBe(resolution === 'cancel' ? 'cancelled' : 'completed');
});

for (const failure of ['receipts', 'heads', 'deadline', 'budget', 'cancel']) test(`claim ${failure} failure rolls back custody and receipt atomically`, async ({ page }) => {
  const result = await page.evaluate(async failure => {
    const c = window.manualSaves, head = await c.seed();
    await c.controlCanonical(c.command(head, 'control.stop', { owner: head.owner }), 'stop');
    const request: CanonicalRequest = { ...c.command((await c.readCanonicalHead()).head, 'control.claim', { owner: 'new' }), deadlineAt: Date.now() + 60_000 };
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put, now = Date.now, controller = new AbortController();
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === failure) throw new DOMException('Injected', 'QuotaExceededError');
      const pending = add.apply(this, args);
      if (this.name === 'receipts' && failure === 'deadline') Date.now = () => request.deadlineAt! + 1;
      if (this.name === 'receipts' && failure === 'cancel') controller.abort();
      return pending;
    };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === failure) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await c.controlCanonical(request, 'claim', { signal: controller.signal, ...(failure === 'budget' ? { limits: { reads: 3, writes: 1, bytes: 16384 } } : {}) }); }
    catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; Date.now = now; }
    const after = await c.dump(), retry = await c.controlCanonical(request, 'claim');
    return { error, before, after, retry };
  }, failure);
  expect(result.error).toMatch(/QuotaExceeded|deadline|budget|abort|cancel/i); expect(result.after).toEqual(result.before);
  expect(result.retry.replayed).toBe(false); expect(result.retry.head?.owner).toBe('new');
});

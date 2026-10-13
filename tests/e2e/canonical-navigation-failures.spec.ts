import { test, expect } from './canonical-navigation-test';

for (const store of ['records', 'nodes', 'receipts', 'heads']) test(`failed ${store} write rolls back movement, knowledge, progress and receipt`, async ({ page }) => {
  const result = await page.evaluate(async store => {
    const c = window.canonicalNavigation, targets = await c.seed(), admitted = await c.admit(targets.target), current = await c.readDestination(admitted.id);
    const request = c.command(current.head, 'navigation.advance', { operationId: admitted.id, sequence: 0 });
    const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
    let error = '';
    try { await c.executeNavigationCommand(request); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
    const after = await c.dump(), retry = await c.executeNavigationCommand(request);
    return { error, before, after, retry, progress: (await c.readDestination(admitted.id)).value.progress };
  }, store);
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
  expect(result.retry.replayed).toBe(false); expect(result.progress.steps).toBe(1);
});

test('normal-capacity refusal cannot consume the funded cancellation and acknowledgement allowance', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed({ limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 });
    const admitted = await c.admit(targets.target, { steps: null, replans: null, durationMs: null });
    await c.fillNormalCapacity();
    const before = await c.dump(), refused = await c.advance(admitted.id).catch(String), after = await c.dump();
    const cancelled = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: admitted.id }), 'cancel');
    const cancelHead = (await c.readCanonicalHead()).head, cancelledRead = await c.readDestination(admitted.id);
    const blocked = await c.advance(admitted.id).catch(String);
    await c.operateCanonical(c.command(cancelHead, 'operation.acknowledge', { operationId: admitted.id, terminalAttemptId: cancelled.receipt.attemptId }), 'acknowledge');
    return { before, after, refused, cancelledRead, blocked, final: await c.readDestination(admitted.id), dump: await c.dump() };
  });
  expect(result.refused).toContain('quota exhausted'); expect(result.after).toEqual(result.before);
  expect(result.cancelledRead.value.status).toBe('cancelled'); expect(result.cancelledRead.value.progress.steps).toBe(0);
  expect(result.blocked).toContain('not admitted'); expect(result.final.value.operation.state).toBe('acknowledged');
  expect(result.final.head.quota.reservations).toBe(0); expect(result.final.head.quota.reservedBytes).toBe(0);
  expect(result.final.head.quota.usedBytes).toBe(result.dump.bytes);
});

test('arrived progress settles and acknowledges from its reservation at normal capacity exhaustion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed({ limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 });
    const admitted = await c.admit(targets.adjacent); await c.advance(admitted.id); await c.fillNormalCapacity();
    const before = await c.readDestination(admitted.id), settled = await c.settle(admitted.id);
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: admitted.id, terminalAttemptId: settled.request.attemptId }), 'acknowledge');
    return { before, after: await c.readDestination(admitted.id), dump: await c.dump() };
  });
  expect(result.before.head.quota.limitBytes - result.before.head.quota.reserveBytes - result.before.head.quota.usedBytes
    - result.before.head.quota.reservedBytes).toBeLessThan(8192);
  expect(result.after.value.operation.state).toBe('acknowledged'); expect(result.after.value.operation.terminal?.disposition).toBe('completed');
  expect(result.after.value.progress).toEqual(result.before.value.progress); expect(result.after.head.quota.reservations).toBe(0);
  expect(result.after.head.quota.usedBytes).toBe(result.dump.bytes);
});

test('running destinations cannot settle as completed; exact sequence and owner fences exclude racing advances', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target);
    const current = await c.readDestination(admission.id), before = await c.dump();
    const premature = await c.executeNavigationCommand(c.command(current.head, 'operation.settle', { operationId: admission.id, disposition: 'completed' })).catch(String);
    const wrongSequence = await c.executeNavigationCommand(c.command(current.head, 'navigation.advance', { operationId: admission.id, sequence: 1 })).catch(String), after = await c.dump();
    const first = c.command(current.head, 'navigation.advance', { operationId: admission.id, sequence: 0 });
    const second = c.command(current.head, 'navigation.advance', { operationId: admission.id, sequence: 0 });
    const racing = await Promise.allSettled([c.executeNavigationCommand(first), c.executeNavigationCommand(second)]);
    return { premature, wrongSequence, before, after, racing: racing.map(r => r.status), progress: (await c.readDestination(admission.id)).value.progress };
  });
  expect(result.premature).toContain('not ready'); expect(result.wrongSequence).toContain('step changed'); expect(result.after).toEqual(result.before);
  expect(result.racing.sort()).toEqual(['fulfilled', 'rejected']); expect(result.progress.sequence).toBe(1); expect(result.progress.steps).toBe(1);
});

test('at most sixteen retained operations can own reservations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed();
    for (let i = 0; i < 16; i++) await c.admit(targets.start);
    const before = await c.dump(), error = await c.admit(targets.start).catch(String);
    return { before, after: await c.dump(), error };
  });
  expect(result.error).toContain('pending operation limit'); expect(result.after).toEqual(result.before);
});

test('caught kernel operation or receipt read failures still abort callback writes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admitted = await c.admit(targets.target), db = await c.openCanonicalDatabase();
    const operation = (await db.getAll('operations'))[0]; operation.witness = 'changed'; await db.put('operations', operation, [operation.gameId, operation.id]); db.close();
    const before = await c.dump(), errors = [];
    for (const source of ['operation', 'receipt']) errors.push(await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.caught'), async tx => {
      try { if (source === 'operation') await tx.liveOperation(admitted.id); else await tx.pages.sourceReceipt('missing'); } catch { /* Must poison transaction. */ }
      tx.setCheckpoint({ changed: true }); return true;
    }).catch(String));
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors.every(e => String(e).includes('not usable'))).toBe(true); expect(result.after).toEqual(result.before);
});

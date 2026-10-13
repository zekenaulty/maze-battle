import { expect, test } from './canonical-test';

for (const phase of ['admit', 'settle', 'acknowledge'] as const) {
  for (const store of ['operations', 'receipts', 'heads']) test(`${phase}: native ${store} failure rolls back reservation and records`, async ({ page }) => {
    const result = await page.evaluate(async ({ phase, store }) => {
      const c = window.canonical;
      if (phase === 'admit') await c.initializeCanonical('owner', {}); else await c.admitFixtureOperation();
      let terminalAttemptId = '';
      if (phase === 'acknowledge') {
        const command = c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'operation-1' });
        await c.operateCanonical(command, 'cancel'); terminalAttemptId = command.attemptId;
      }
      const head = (await c.readCanonicalHead()).head;
      const command = c.command(head, `operation.${phase}`, phase === 'admit'
        ? { operationId: 'operation-1', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }
        : phase === 'settle' ? { operationId: 'operation-1', disposition: 'completed' } : { operationId: 'operation-1', terminalAttemptId });
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function (...args) { if (this.name === store) throw new DOMException('Injected quota', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function (...args) { if (this.name === store) throw new DOMException('Injected quota', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await c.operateCanonical(command, phase, phase === 'acknowledge' ? undefined : async tx => { await tx.pages.set('world', 'changed', true); return 1; }); }
      catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      return { error, before, after: await c.dump() };
    }, { phase, store });
    expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
  });
}

test('insufficient admission capacity cannot publish the operation or callback effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {}, undefined, { quota: { limitBytes: 180_000, reserveBytes: 65_536 } });
    const before = await c.dump();
    const error = await c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'op', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }),
      'admit', async tx => { await tx.pages.set('world', 'must-not-commit', true); return null; }).catch(String);
    return { before, after: await c.dump(), error };
  });
  expect(result.error).toContain('storage quota'); expect(result.after).toEqual(result.before);
});

test('wrong terminal acknowledgement and duplicate settlement do not release reservations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.admitFixtureOperation();
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'operation-1' }), 'cancel');
    const before = await c.dump(), head = (await c.readCanonicalHead()).head;
    const wrong = await c.operateCanonical(c.command(head, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId: 'not-original' }), 'acknowledge').catch(String);
    const twice = await c.operateCanonical(c.command(head, 'operation.settle', { operationId: 'operation-1', disposition: 'completed' }), 'settle', async () => null).catch(String);
    return { before, after: await c.dump(), wrong, twice };
  });
  expect(result.wrong).toContain('acknowledgement changed'); expect(result.twice).toContain('phase changed'); expect(result.after).toEqual(result.before);
});

test('cancellation cannot smuggle world callbacks or bypass the reserved host namespace', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.admitFixtureOperation();
    const command = c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'operation-1' });
    const before = await c.dump(), errors = [];
    try { await c.operateCanonical(command, 'cancel', async tx => { await tx.pages.set('world', 'forbidden', 1); return 1; }); } catch (error) { errors.push(String(error)); }
    try { await c.executeCanonical(command, async () => 1); } catch (error) { errors.push(String(error)); }
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors).toEqual([expect.stringContaining('invalid operation callback'), expect.stringContaining('reserved host operation')]);
  expect(result.after).toEqual(result.before);
});

for (const corruption of ['missing-source', 'changed-source', 'changed-reserve', 'missing-terminal']) test(`${corruption} blocks release instead of inventing completion`, async ({ page }) => {
  const result = await page.evaluate(async corruption => {
    const c = window.canonical, setup = await c.admitFixtureOperation(); let terminalAttemptId = '';
    if (corruption === 'missing-terminal') {
      const command = c.command(setup.head, 'operation.cancel', { operationId: 'operation-1' });
      await c.operateCanonical(command, 'cancel'); terminalAttemptId = command.attemptId;
    }
    const head = (await c.readCanonicalHead()).head, db = await c.openCanonicalDatabase();
    if (corruption === 'missing-source') await db.delete('receipts', [head.gameId, setup.input.attemptId]);
    if (corruption === 'missing-terminal') await db.delete('receipts', [head.gameId, terminalAttemptId]);
    if (corruption === 'changed-source') {
      const original = (await db.get('receipts', [head.gameId, setup.input.attemptId]))!;
      await db.put('receipts', { ...original, fingerprint: original.fingerprint.replace('known-room', 'secret-room') }, [head.gameId, original.attemptId]);
    }
    if (corruption === 'changed-reserve') {
      const row = (await db.get('operations', [head.gameId, 'operation-1']))!;
      await db.put('operations', { ...row, terminalBytes: row.terminalBytes * 2 }, [head.gameId, row.id]);
    }
    db.close(); const before = await c.dump();
    const error = await (corruption === 'missing-terminal'
      ? c.operateCanonical(c.command(head, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId }), 'acknowledge')
      : c.operateCanonical(c.command(head, 'operation.cancel', { operationId: 'operation-1' }), 'cancel')).catch(String);
    return { error, before, after: await c.dump() };
  }, corruption);
  expect(result.error).toMatch(/missing|changed|mismatch/); expect(result.after).toEqual(result.before);
});

test('a reset rejects old operation attempts and drops outstanding reservations deliberately', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.admitFixtureOperation();
    const command = c.command(head, 'operation.cancel', { operationId: 'operation-1' });
    await c.resetCanonical('new-owner', {});
    return { stale: await c.operateCanonical(command, 'cancel').catch(String), current: await c.readCanonical(p => p.liveOperation('operation-1')) };
  });
  expect(result.stale).toContain('generation changed'); expect(result.current.value).toBeUndefined();
  expect(result.current.head.quota).toMatchObject({ reservedBytes: 0, reservations: 0 });
});

test('current operation custody is not silently mixed into historical snapshot reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.admitFixtureOperation();
    return await c.readCanonical(p => p.liveOperation('operation-1'), { snapshot: c.snapshotOf(head) }).catch(String);
  });
  expect(result).toContain('historical snapshot');
});

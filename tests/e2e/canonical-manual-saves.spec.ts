import { expect, test } from './canonical-manual-saves.test';

test('create/list/load/delete retain roots, custody and accounting across native reload', async ({ page }) => {
  const created = await page.evaluate(async () => {
    const c = window.manualSaves, head = await c.seed(), probe = c.storageProbe(), save = await c.create('  Camp one  ');
    const writes = probe.finish(); await c.change(3);
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.roster'), async tx => {
      const before = await c.roster.loadRoster(tx.pages, c.roster.rosterContext(c.roster.gameCheckpoint(tx.head.checkpoint)));
      await c.roster.saveRoster(tx.pages, before, { ...before.state, inventory: { ...before.state.inventory, gold: 999 } });
      return true;
    });
    return { head, save, writes, before: (await c.readCanonicalHead()).head, list: await c.listManualSaves() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.manualSaves);
  const loaded = await page.evaluate(async id => {
    const c = window.manualSaves, before = await c.dump(), db = await c.openCanonicalDatabase();
    const receipts = await db.getAll('receipts'); db.close();
    const probe = c.storageProbe(), outcome = await c.act({ kind: 'load', id }), io = probe.finish();
    const state = await c.roster.read(), values = (await c.readCanonical(async p => ({ world: (await p.get('world', 'fixture/world'))?.value,
      knowledge: (await p.get('knowledge', 'fixture/knowledge'))?.value, execution: (await p.get('execution', 'fixture/execution'))?.value }))).value;
    const after = await c.dump(), db2 = await c.openCanonicalDatabase(), retained = await db2.getAll('receipts'); db2.close();
    await c.act({ kind: 'delete', id });
    return { before, after, outcome, io, state, values, receipts, retained, list: await c.listManualSaves() };
  }, created.save.id);
  const head = loaded.outcome.outcome.head!;
  expect(created.list).toEqual([{ slotId: created.save.id, label: 'Camp one', kind: 'manual', updatedAt: expect.any(String),
    dungeonLevel: 1, partyLevels: { warrior: 1, mage: 1, healer: 1 } }]);
  expect(head.checkpoint).toEqual(created.head.checkpoint);
  expect(head.roots).toEqual({ ...created.head.roots, execution: created.before.roots.execution });
  expect([head.owner, head.epoch, head.status, head.allocations]).toEqual([created.before.owner, created.before.epoch, 'ready', {}]);
  expect(head.revision).toBe(created.before.revision + 1);
  expect(head.quota.usedBytes).toBe(loaded.after.bytes); expect(head.quota.usedBytes).toBeGreaterThan(created.before.quota.usedBytes);
  expect(head.quota).toEqual({ ...created.before.quota, usedBytes: loaded.after.bytes });
  expect(loaded.values).toEqual({ world: 0, knowledge: 0, execution: 3 });
  expect(loaded.state.value.state.inventory.gold).not.toBe(999);
  expect(loaded.retained.filter(row => row.attemptId !== loaded.outcome.request.attemptId)).toEqual(loaded.receipts);
  expect(loaded.list).toEqual([]);
  expect(loaded.io.operations.filter(op => ['add', 'put'].includes(op.method)).map(op => op.store)).toEqual(['receipts', 'heads']);
  expect(created.writes.operations.some(op => ['getAll', 'getAllKeys'].includes(op.method))).toBe(false);
});

test('exact create/load/delete replay never reapplies state after later mutations, deletion or takeover', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const create = await c.create(); await c.change();
    const load = await c.act({ kind: 'load', id: create.id });
    const deleted = await c.act({ kind: 'delete', id: create.id }); await c.change(8);
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'new-owner' }), 'takeover');
    const before = await c.dump(), outcomes = [];
    for (const operation of [create, load, deleted]) outcomes.push(await c.executeSaveCommand(operation.request));
    const changed = { ...create.request, input: { kind: 'create', label: 'different' } };
    const mismatch = await c.executeSaveCommand(changed).catch(String);
    return { before, after: await c.dump(), outcomes, originals: [create, load, deleted].map(x => x.outcome.receipt), mismatch };
  });
  expect(result.after).toEqual(result.before);
  expect(result.outcomes.every(x => x.replayed)).toBe(true);
  expect(result.outcomes.map(x => x.receipt)).toEqual(result.originals);
  expect(result.outcomes.every(x => x.stats.reads === 2 && x.stats.writes === 0)).toBe(true);
  expect(result.mismatch).toContain('invalid original receipt');
});

test('sixteen bounded named saves, delete frees a slot and load does not roll back the catalog', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const ids = [];
    for (let i = 0; i < 16; i++) ids.push((await c.create(`Camp ${i}`)).id);
    const before = await c.dump(), full = await c.create('Overflow').catch(String), after = await c.dump();
    await c.act({ kind: 'delete', id: ids[1] }); const newest = await c.create('Replacement');
    await c.act({ kind: 'load', id: ids[0] });
    return { before, after, full, ids, newest: newest.id, list: await c.listManualSaves() };
  });
  expect(result.full).toContain('limit'); expect(result.after).toEqual(result.before);
  expect(result.list).toHaveLength(16); expect(result.list.map(x => x.slotId)).toContain(result.newest);
  expect(result.list.map(x => x.slotId)).not.toContain(result.ids[1]);
});

test('strict request fields reject raw roots and invalid labels/ids without effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; const head = await c.seed(), before = await c.dump(), errors = [];
    for (const input of [{ kind: 'create', label: '' }, { kind: 'create', label: '   ' }, { kind: 'create', label: 'a'.repeat(81) },
      { kind: 'create', label: 'a\nb' }, { kind: 'load', id: '../root' }, { kind: 'load', id: 'missing' }, { kind: 'delete', id: 'missing' },
      { kind: 'load', id: 'valid', roots: head.roots }, { kind: 'create', label: 'Camp', snapshot: head }]) {
      try { await c.executeSaveCommand(c.command(head, 'save.command', input as never)); errors.push('accepted'); } catch (error) { errors.push(String(error)); }
    }
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors).toHaveLength(9); expect(result.errors.every(x => x.startsWith('Error:'))).toBe(true);
  expect(result.after).toEqual(result.before);
});

test('fresh stale requests fail; new owner can load; reset invalidates saves and old receipts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const save = await c.create();
    const stale = c.command((await c.readCanonicalHead()).head, 'save.command', { kind: 'load', id: save.id });
    await c.change(); const staleRevision = await c.executeSaveCommand(stale).catch(String);
    const prior = (await c.readCanonicalHead()).head;
    await c.controlCanonical(c.command(prior, 'control.takeover', { owner: 'successor' }), 'takeover');
    const staleOwner = await c.executeSaveCommand(c.command({ ...prior, revision: prior.revision + 1 }, 'save.command', { kind: 'load', id: save.id })).catch(String);
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'successor' }), 'resume');
    const loaded = await c.act({ kind: 'load', id: save.id });
    await c.resetCanonical('fresh', prior.checkpoint);
    const before = await c.dump(), generation = await c.executeSaveCommand(save.request).catch(String);
    const missing = await c.act({ kind: 'load', id: save.id }).catch(String);
    return { staleRevision, staleOwner, loaded, generation, missing, before, after: await c.dump(), list: await c.listManualSaves() };
  });
  expect(result.staleRevision).toContain('stale'); expect(result.staleOwner).toContain('stale');
  expect(result.loaded.outcome.head?.owner).toBe('successor'); expect(result.loaded.outcome.head?.epoch).toBe(3);
  expect(result.generation).toContain('generation changed'); expect(result.missing).toContain('not found');
  expect(result.after).toEqual(result.before); expect(result.list).toEqual([]);
});

test('admitted and settled allocations block create/load until acknowledgement, without restoring the ledger', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const save = await c.create();
    const req = c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: 'pending', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES });
    await c.operateCanonical(req, 'admit', async () => true); const errors = [];
    for (const phase of ['admitted', 'settled']) {
      const before = await c.dump();
      errors.push(await c.act({ kind: 'create', label: 'Pending' }).catch(String));
      errors.push(await c.act({ kind: 'load', id: save.id }).catch(String));
      if ((await c.dump()).content !== before.content) throw Error('Failed save mutated live operation');
      if (phase === 'admitted') await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'pending' }), 'cancel');
    }
    const operation = (await c.readCanonical(p => p.liveOperation('pending'))).value!;
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: 'pending', terminalAttemptId: operation.terminal!.attemptId }), 'acknowledge');
    const before = (await c.readCanonical(p => p.liveOperation('pending'))).value;
    await c.act({ kind: 'load', id: save.id });
    return { errors, before, after: (await c.readCanonical(p => p.liveOperation('pending'))).value };
  });
  expect(result.errors.every(x => String(x).includes('live allocations'))).toBe(true);
  expect(result.before?.state).toBe('acknowledged'); expect(result.after).toEqual(result.before);
});

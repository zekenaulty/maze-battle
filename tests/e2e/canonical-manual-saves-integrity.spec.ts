import { expect, test } from './canonical-manual-saves.test';

for (const corruption of ['missing-save', 'foreign-save', 'extra-snapshot', 'future-snapshot', 'foreign-snapshot', 'checkpoint', 'raw-execution-root',
  'wrong-world-root', 'wrong-label', 'wrong-levels', 'missing-receipt', 'receipt-id', 'receipt-source', 'receipt-witness',
  'receipt-revision', 'missing-world-root', 'missing-knowledge-root', 'foreign-root', 'invalid-root']) {
  test(`stored ${corruption} fails closed on list/load/delete`, async ({ page }) => {
    const result = await page.evaluate(async corruption => {
      const c = window.manualSaves; const original = await c.seed(), save = await c.create(); await c.change();
      const db = await c.openCanonicalDatabase(), records = await db.getAll('records');
      const record = records.find(row => row.key === `manual-saves/snapshot/${save.id}`)!;
      const value = record.value as Record<string, any>, receipt = (await db.get('receipts', [original.gameId, save.id]))!;
      if (corruption === 'missing-save') await db.delete('records', [record.gameId, record.id]);
      else if (corruption === 'missing-receipt') await db.delete('receipts', [original.gameId, save.id]);
      else if (corruption.startsWith('receipt-')) {
        if (corruption === 'receipt-id') receipt.attemptId = 'other';
        if (corruption === 'receipt-witness') (receipt.result as Record<string, any>).snapshotWitness = '{}';
        if (corruption === 'receipt-revision') { receipt.beforeRevision++; receipt.afterRevision++; }
        if (corruption === 'receipt-source') {
          const request = JSON.parse(receipt.fingerprint); request.input.label = 'Different'; receipt.fingerprint = c.canonicalJson(request);
        }
        await db.put('receipts', receipt, [original.gameId, save.id]);
      } else if (corruption.includes('root') && !['raw-execution-root', 'wrong-world-root'].includes(corruption)) {
        const id = corruption === 'missing-knowledge-root' ? original.roots.knowledge! : original.roots.world!;
        if (corruption.startsWith('missing-')) await db.delete('nodes', [original.gameId, id]);
        else {
          const row = (await db.get('nodes', [original.gameId, id]))!;
          if (corruption === 'foreign-root') row.generation = 'foreign'; else row.node.witness = '{}';
          await db.put('nodes', row, [original.gameId, id]);
        }
      } else {
        if (corruption === 'foreign-save') record.generation = 'foreign';
        if (corruption === 'extra-snapshot') value.snapshot.extra = true;
        if (corruption === 'future-snapshot') value.snapshot.revision = 9999;
        if (corruption === 'foreign-snapshot') value.snapshot.gameId = 'other';
        if (corruption === 'checkpoint') value.snapshot.checkpoint = {};
        if (corruption === 'raw-execution-root') value.snapshot.roots.execution = original.roots.execution;
        if (corruption === 'wrong-world-root') value.snapshot.roots.world = original.roots.knowledge;
        if (corruption === 'wrong-label') value.summary.label = 'Replaced';
        if (corruption === 'wrong-levels') value.summary.partyLevels.warrior = -1;
        await db.put('records', record, [record.gameId, record.id]);
      }
      db.close(); const before = await c.dump(), errors = [];
      errors.push(await c.listManualSaves().then(() => 'accepted', String));
      for (const kind of ['load', 'delete']) errors.push(await c.act({ kind, id: save.id }).then(() => 'accepted', String));
      return { errors, before, after: await c.dump() };
    }, corruption);
    expect(result.errors.every(error => error.startsWith('Error:'))).toBe(true);
    expect(result.after).toEqual(result.before);
  });
}

for (const mismatch of ['operation', 'id', 'snapshot-revision', 'summary', 'checkpoint']) test(`matching witness still requires exact ${mismatch} source semantics`, async ({ page }) => {
  const result = await page.evaluate(async mismatch => {
    const c = window.manualSaves; await c.seed(); const save = await c.create(), db = await c.openCanonicalDatabase();
    const row = (await db.getAll('records')).find(row => row.key === `manual-saves/snapshot/${save.id}`)!;
    const value = row.value as Record<string, any>, receipt = (await db.get('receipts', [row.gameId, save.id]))!;
    if (mismatch === 'operation' || mismatch === 'id') {
      const request = JSON.parse(receipt.fingerprint);
      if (mismatch === 'operation') request.operation = 'fixture.command';
      else { request.attemptId = 'other'; receipt.attemptId = 'other'; value.sourceAttemptId = 'other'; }
      receipt.fingerprint = c.canonicalJson(request);
    }
    if (mismatch === 'snapshot-revision') value.snapshot.revision--;
    if (mismatch === 'summary') value.summary.dungeonLevel++;
    if (mismatch === 'checkpoint') value.snapshot.checkpoint = { schema: 1 };
    (receipt.result as Record<string, any>).snapshotWitness = c.canonicalJson(row);
    await db.put('records', row, [row.gameId, row.id]); await db.put('receipts', receipt, [row.gameId, receipt.attemptId]); db.close();
    const before = await c.dump(), error = await c.act({ kind: 'load', id: save.id }).then(() => 'accepted', String);
    return { error, before, after: await c.dump() };
  }, mismatch);
  expect(result.error).toMatch(/^Error:/); expect(result.after).toEqual(result.before);
});

test('restore rejects raw snapshots, mixing roots/checkpoints, and caught restore failures poison the transaction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const save = await c.create(), head = (await c.readCanonicalHead()).head;
    const before = await c.dump(), errors = [];
    for (const failure of ['raw', 'before', 'after', 'checkpoint', 'caught', 'repeat']) {
      errors.push(await c.executeCanonical(c.command(head, 'fixture.restore'), async tx => {
        if (failure === 'before') await tx.pages.get('world', 'fixture/world');
        if (failure === 'caught') { try { await tx.restoreSnapshot('missing'); } catch { /* Must poison. */ } }
        else await tx.restoreSnapshot(failure === 'raw' ? head as never : `manual-saves/snapshot/${save.id}`);
        if (failure === 'after') await tx.pages.set('knowledge', 'fixture/new', 1);
        if (failure === 'checkpoint') tx.setCheckpoint({ overwritten: true });
        if (failure === 'repeat') await tx.restoreSnapshot(`manual-saves/snapshot/${save.id}`);
        return true;
      }).then(() => 'accepted', String));
    }
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors.every(error => error.startsWith('Error:'))).toBe(true); expect(result.after).toEqual(result.before);
});

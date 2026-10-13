import { test, expect } from './canonical-navigation-test';

for (const corruption of ['progress', 'source-id', 'source-receipt', 'source-result', 'source-command', 'foreign-record', 'record-revision', 'missing-progress', 'operation', 'knowledge', 'world']) {
  test(`${corruption} corruption refuses advancement atomically`, async ({ page }) => {
    const result = await page.evaluate(async corruption => {
      const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target), db = await c.openCanonicalDatabase();
      const row = (await db.getAll('records')).find(row => row.key === c.destinationKey(admission.id))!, value = row.value as Record<string, any>;
      if (corruption === 'world') {
        const record = (await db.getAll('records')).find(row => row.key === 'dungeon/1/space/entry')!;
        await db.delete('records', [record.gameId, record.id]);
      } else if (corruption === 'knowledge') {
        const checkpoint = c.roster.gameCheckpoint((await c.readCanonicalHead()).head.checkpoint);
        await db.delete('records', [row.gameId, checkpoint.knowledge!.id]);
      } else if (corruption === 'operation') {
        const operation = (await db.get('operations', [row.gameId, admission.id]))!; operation.owner = 'wrong';
        await db.put('operations', operation, [row.gameId, operation.id]);
      } else if (corruption.startsWith('source-') && corruption !== 'source-id') {
        const receipt = (await db.get('receipts', [row.gameId, admission.request.attemptId]))!;
        if (corruption === 'source-receipt') await db.delete('receipts', [row.gameId, receipt.attemptId]);
        else {
          if (corruption === 'source-result') (receipt.result as Record<string, any>).recordWitness = '{}';
          else { const request = JSON.parse(receipt.fingerprint); request.input.binding.target.cell.column++; receipt.fingerprint = c.canonicalJson(request); }
          await db.put('receipts', receipt, [row.gameId, receipt.attemptId]);
        }
      } else if (corruption === 'missing-progress') await db.delete('records', [row.gameId, row.id]);
      else {
        if (corruption === 'progress') value.route[0].to.cell.column++;
        if (corruption === 'source-id') value.sourceAttemptId = 'other';
        if (corruption === 'foreign-record') row.generation = 'foreign';
        if (corruption === 'record-revision') row.revision--;
        await db.put('records', row, [row.gameId, row.id]);
      }
      db.close(); const before = await c.dump();
      const request = c.command((await c.readCanonicalHead()).head, 'navigation.advance', { operationId: admission.id, sequence: 0 });
      const error = await c.executeNavigationCommand(request).catch(String), after = await c.dump();
      return { error, before, after };
    }, corruption);
    expect(String(result.error)).toMatch(/Error:/); expect(result.after).toEqual(result.before);
  });
}

test('corrupt navigation progress cannot prevent funded kernel cancellation and acknowledgement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target), db = await c.openCanonicalDatabase();
    const row = (await db.getAll('records')).find(row => row.key === c.destinationKey(admission.id))!;
    await db.delete('records', [row.gameId, row.id]); db.close();
    const cancelled = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: admission.id }), 'cancel');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: admission.id, terminalAttemptId: cancelled.receipt.attemptId }), 'acknowledge');
    return c.readCanonical(p => p.liveOperation(admission.id));
  });
  expect(result.value?.state).toBe('acknowledged'); expect(result.head.quota.reservations).toBe(0);
});

for (const field of ['operation', 'sequence', 'operationId', 'owner']) test(`matching progress witness still requires exact advance source ${field}`, async ({ page }) => {
  const result = await page.evaluate(async field => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target), step = await c.advance(admission.id);
    const db = await c.openCanonicalDatabase(), receipt = (await db.get('receipts', [step.request.expected.gameId, step.request.attemptId]))!;
    const source = JSON.parse(receipt.fingerprint);
    if (field === 'operation') source.operation = 'fixture.advance';
    else if (field === 'owner') source.expected.owner = 'other';
    else source.input[field] = field === 'sequence' ? 99 : 'other';
    receipt.fingerprint = c.canonicalJson(source); await db.put('receipts', receipt, [receipt.gameId, receipt.attemptId]); db.close();
    const before = await c.dump(), error = await c.advance(admission.id).catch(String);
    return { before, after: await c.dump(), error };
  }, field);
  expect(String(result.error)).toMatch(/Error:/); expect(result.after).toEqual(result.before);
});

test('world legality may veto an earned step but cannot supply an alternative route', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.adjacent);
    await c.content.work(async tx => {
      const ports = await c.world.loadPorts(tx.pages, 1, 'entry');
      await tx.pages.set('world', c.world.entityKey(1, 'ports', 'entry'), c.json({ ...ports, connections: [] })); return null;
    });
    const before = (await c.readCanonicalHead()).head; await c.advance(admission.id);
    return { before, after: await c.readDestination(admission.id) };
  });
  expect(result.after.value.progress).toMatchObject({ steps: 0, replans: 0, status: 'blocked', reason: 'obstructed' });
  expect(result.after.head.checkpoint).toEqual(result.before.checkpoint); expect(result.after.head.roots.world).toBe(result.before.roots.world);
  expect(result.after.head.roots.knowledge).toBe(result.before.roots.knowledge);
});

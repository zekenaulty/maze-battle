import { expect, test } from './canonical-agentica.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const target of ['publication', 'pending', 'result'] as const) for (const damage of ['missing-record', 'missing-receipt', 'malformed', 'source-input', 'custody']) {
  test(`${target}: ${damage} cannot turn a referenced source into null or usable evidence`, async ({ page }) => {
    const r = await page.evaluate(async ({ target, damage }) => {
      const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
      const pending = await c.pending(action, pub.reference), result = await c.complete(action, c.protocolResult(action));
      const ref = target === 'publication' ? pub.reference : target === 'pending' ? pending.reference : result.reference;
      const db = await c.openCanonicalDatabase(), row = (await db.get('records', [head.gameId, ref.id]))!, value = row.value as JsonObject;
      const source = (await db.get('receipts', [head.gameId, value.sourceAttemptId as string]))!;
      if (damage === 'missing-record') await db.delete('records', [head.gameId, ref.id]);
      else if (damage === 'missing-receipt') await db.delete('receipts', [head.gameId, source.attemptId]);
      else if (damage === 'source-input') {
        const request = JSON.parse(source.fingerprint); request.input = { changed: true }; source.fingerprint = c.fingerprint(request);
        await db.put('receipts', source, [head.gameId, source.attemptId]);
      } else {
        if (damage === 'malformed') value.extra = 'not-in-schema'; else value.owner = 'impostor';
        (source.result as JsonObject).snapshotWitness = c.canonicalJson(row);
        await db.put('records', row, [head.gameId, ref.id]); await db.put('receipts', source, [head.gameId, source.attemptId]);
      }
      db.close(); const before = await c.dump();
      const error = await c.reconcile(action).then(() => 'unexpected-success', String);
      return { before, after: await c.dump(), error };
    }, { target, damage });
    expect(r.error).toMatch(/^Error:/); expect(r.after).toBe(r.before);
  });
}

for (const field of ['key', 'fingerprint', 'action']) test(`digest bucket does not authorize mismatched full ${field}`, async ({ page }) => {
  const r = await page.evaluate(async field => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const pending = await c.pending(action, pub.reference), db = await c.openCanonicalDatabase();
    const row = (await db.get('records', [head.gameId, pending.reference.id]))!, value = row.value as JsonObject;
    if (field === 'key') value.key = '["different-key-in-same-digest-bucket"]';
    else if (field === 'fingerprint') value.fingerprint = c.canonicalJson({ ...action, stepId: 'other-step' });
    else value.action = { ...action, arguments: { row: 999 } } as unknown as JsonObject;
    const receipt = (await db.get('receipts', [head.gameId, value.sourceAttemptId as string]))!;
    (receipt.result as JsonObject).snapshotWitness = c.canonicalJson(row);
    await db.put('records', row, [head.gameId, row.id]); await db.put('receipts', receipt, [head.gameId, receipt.attemptId]); db.close();
    const before = await c.dump(), read = await c.reconcile(action).catch(String), write = await c.pending(action, pub.reference).catch(String);
    return { before, after: await c.dump(), read, write };
  }, field);
  expect(String(r.read)).toMatch(/collision|input changed/); expect(String(r.write)).toMatch(/collision|input changed/);
  expect(r.after).toBe(r.before);
});

test('missing referenced root and explicit result reference throw; genuinely undiscovered action/result remains absent', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const absent = await c.reconcile(action); await c.pending(action, pub.reference);
    const identity = await c.prepareAction(action), missing = await c.readCanonical(p => c.readActionResult(p, identity,
      { key: `${identity.storageKey}/result`, id: 'not-written' })).catch(String);
    const pending = await c.reconcile(action), db = await c.openCanonicalDatabase();
    await db.delete('nodes', [head.gameId, head.roots.world!]); db.close();
    const source = await c.readCanonical(p => c.readPublication(p, pub.reference)).catch(String);
    return { absent, pending, missing, source };
  });
  expect(r.absent.value).toBeNull(); expect(r.pending.value!.status).toBe('pending');
  expect(String(r.missing)).toMatch(/^Error:/); expect(String(r.source)).toMatch(/^Error:/);
});

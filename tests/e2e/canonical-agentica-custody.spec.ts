import { expect, test } from './canonical-agentica.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const proof of ['standalone', 'navigation'] as const) test(`${proof}: an orphan result cannot become a new original`, async ({ page }) => {
  const r = await page.evaluate(async proof => {
    const c = window.agenticaRecords;
    let action, publication;
    if (proof === 'navigation') {
      const n = await c.navigationFixture(), seeded = await n.seed(); action = seeded.action; publication = seeded.publication;
      await n.navigation.executeNavigationCommand(await n.admission(seeded.target), { host: await n.host(action) });
    } else {
      const head = await c.seed(); publication = await c.publish(); action = c.protocolAction(head.revision);
      await c.pending(action, publication.reference); await c.complete(action, c.protocolResult(action));
    }
    const original = (await c.read(action)).value!, identity = await c.prepareAction(action);
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.remove-index'), async tx => {
      await tx.pages.delete('execution', identity.storageKey); return true;
    });
    const before = await c.dump(), read = await c.reconcile(action).then(() => 'unexpected success', String);
    const write = await c.pending(action, publication.reference, original.original.effect).then(() => 'unexpected success', String);
    return { before, after: await c.dump(), read, write };
  }, proof);
  expect(r.read).toContain('result without original'); expect(r.write).toContain('result without original');
  expect(r.after).toBe(r.before);
});

test('duplicate pending retention validates the existing result, even with a matching record witness', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference); const completed = await c.complete(action, c.protocolResult(action));
    const db = await c.openCanonicalDatabase(), row = (await db.get('records', [head.gameId, completed.reference.id]))!;
    const value = row.value as JsonObject, receipt = (await db.get('receipts', [head.gameId, value.sourceAttemptId as string]))!;
    (value.result as JsonObject).actionId = 'wrong-original'; (receipt.result as JsonObject).recordWitness = c.canonicalJson(row);
    await db.put('records', row, [head.gameId, row.id]); await db.put('receipts', receipt, [head.gameId, receipt.attemptId]); db.close();
    const before = await c.dump(), error = await c.pending(action, pub.reference).then(() => 'unexpected success', String);
    return { before, after: await c.dump(), error };
  });
  expect(r.error).toContain('identity'); expect(r.after).toBe(r.before);
});

test('pending retention snapshots the prepared action before its first await', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const identity = await c.prepareAction(action), request = c.command((await c.readCanonicalHead()).head, 'agentica.pending');
    await c.executeCanonical(request, async tx => {
      const work = c.retainPendingAction(tx, request, identity, pub.reference, 'readOnly');
      identity.action.arguments.row = 999;
      return (await work).receipt;
    });
    return { retained: (await c.read(action)).value, action };
  });
  expect(r.retained!.original.action).toEqual(r.action);
  expect(JSON.parse(r.retained!.original.fingerprint)).toEqual(r.action);
});

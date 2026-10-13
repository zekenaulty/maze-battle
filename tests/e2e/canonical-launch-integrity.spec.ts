import { expect, test } from './canonical-launch.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const target of ['state', 'dispatch', 'run', 'grant'] as const) for (const damage of ['missing-record', 'missing-receipt', 'witness', 'source', 'body'])
  test(`${target} ${damage} cannot silently become absent or grant an effect`, async ({ page }) => {
    const r = await page.evaluate(async ({ target, damage }) => {
      const c = window.canonicalLaunch; await c.ready(); const current = (await c.readLaunch()).value!, selected = current[target]!;
      const db = await c.openCanonicalDatabase(), row = (await db.get('records', [current.guard.gameId, selected.ref.id]))!;
      const receipt = (await db.get('receipts', [current.guard.gameId, selected.source.attemptId]))!, result = receipt.result as JsonObject;
      if (damage === 'missing-record') await db.delete('records', [row.gameId, row.id]);
      else if (damage === 'missing-receipt') await db.delete('receipts', [row.gameId, receipt.attemptId]);
      else if (damage === 'source') { const source = JSON.parse(receipt.fingerprint); source.input.launchId = 'other'; receipt.fingerprint = c.fingerprint(source); await db.put('receipts', receipt, [row.gameId, receipt.attemptId]); }
      else {
        const proof = (result.launchRecords as JsonObject[]).find(p => p.id === row.id)!;
        if (damage === 'witness') proof.witness = '{}';
        else { ((row.value as JsonObject).data as JsonObject).extra = true; proof.witness = c.canonicalJson(row); await db.put('records', row, [row.gameId, row.id]); }
        await db.put('receipts', receipt, [row.gameId, receipt.attemptId]);
      }
      db.close(); const before = await c.dump(), read = await c.readLaunch().then(() => 'unexpected success', String), gate = await c.gate().then(() => 'unexpected success', String);
      return { before, after: await c.dump(), read, gate };
    }, { target, damage });
    expect(r.read).toMatch(/^Error:/); expect(r.gate).toMatch(/^Error:/); expect(r.after).toEqual(r.before);
  });

test('missing dispatch index and orphan run fail closed; missing active pointer cannot fund a second launch', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready();
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.remove-index'), async tx => {
      await tx.pages.delete('execution', 'agentica/launches/launch/dispatch'); return true;
    });
    const before = await c.dump(), read = await c.readLaunch().catch(String), duplicate = await c.transition('dispatch').catch(String), after = await c.dump();
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.remove-pointer'), async tx => { await tx.pages.delete('execution', 'agentica/launch/active'); return true; });
    const next = await c.binding('next'), pre = await c.dump(), missing = await c.readLaunch().catch(String), admit = await c.admit(next).catch(String);
    return { before, after, read, duplicate, missing, admit, pre, post: await c.dump() };
  });
  expect(String(r.read)).toContain('missing referenced'); expect(String(r.duplicate)).toContain('missing referenced'); expect(r.after).toEqual(r.before);
  expect(String(r.missing)).toContain('missing active funded'); expect(String(r.admit)).toContain('active pointer'); expect(r.post).toEqual(r.pre);
});

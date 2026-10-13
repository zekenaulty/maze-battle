import { expect, test } from './canonical-agentica.test';
import type { CanonicalGameSnapshot, JsonObject } from '../../src/persistence/canonical/types';

for (const damage of ['missing-host', 'missing-action', 'witness', 'key', 'record-id', 'revision', 'source-attempt', 'extra', 'body', 'missing-record', 'missing-receipt']) {
  test(`navigation proof ${damage} rejects reconciliation even with valid-looking standalone fields`, async ({ page }) => {
    const r = await page.evaluate(async damage => {
      const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
      const committed = await n.navigation.executeNavigationCommand(request, { host: await n.host(seeded.action) });
      const retained = (await c.read(seeded.action)).value!, ref = retained.resultReference!, db = await c.openCanonicalDatabase();
      const row = (await db.get('records', [seeded.head.gameId, ref.id]))!, receipt = committed.receipt, result = receipt.result as JsonObject;
      // These fields must never rescue a missing or invalid navigation proof.
      result.recordId = row.id; result.recordWitness = c.canonicalJson(row); result.reference = { ...ref };
      const host = result.host as JsonObject, proof = host.actionResult as JsonObject;
      if (damage === 'missing-host') delete result.host;
      if (damage === 'missing-action') delete host.actionResult;
      if (damage === 'witness') proof.recordWitness = '{}';
      if (damage === 'key') proof.key = 'agentica/actions/other/result';
      if (damage === 'record-id') proof.recordId = 'other';
      if (damage === 'revision') proof.revision = Number(proof.revision) + 1;
      if (damage === 'source-attempt') proof.sourceAttemptId = 'other';
      if (damage === 'extra') proof.unexpected = true;
      if (damage === 'body') { ((row.value as JsonObject).result as JsonObject).summary = 'Replaced original'; await db.put('records', row, [row.gameId, row.id]); }
      await db.put('receipts', receipt, [row.gameId, receipt.attemptId]);
      if (damage === 'missing-record') await db.delete('records', [row.gameId, row.id]);
      if (damage === 'missing-receipt') await db.delete('receipts', [row.gameId, receipt.attemptId]);
      db.close(); const before = await c.dump(), error = await c.reconcile(seeded.action).then(() => 'unexpected success', String);
      return { before, after: await c.dump(), error };
    }, damage);
    expect(r.error).toMatch(/^Error:/); expect(r.after).toBe(r.before);
  });
}

test('the hook rejects changed result references before any native commit', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const host = await n.host(seeded.action), before = await c.dump();
    const error = await n.navigation.executeNavigationCommand(request, { host: { ...host, commit: async view => {
      const refs = await host.commit(view); return { actionResult: { ...refs.actionResult!, recordWitness: '{}' } };
    } } }).catch(String);
    return { before, after: await c.dump(), error, action: (await c.reconcile(seeded.action)).value };
  });
  expect(String(r.error)).toContain('not from this commit'); expect(r.after).toBe(r.before); expect(r.action!.status).toBe('pending');
});

for (const phase of ['prepare', 'commit'] as const) for (const fault of ['caught', 'unawaited'] as const) {
  test(`${phase}: ${fault} savedSnapshot failure poisons the guarded navigation transaction`, async ({ page }) => {
    const r = await page.evaluate(async ({ phase, fault }) => {
      const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
      const original = await n.host(seeded.action), before = await c.dump();
      const fail = async (view: Parameters<typeof original.prepare>[0]) => {
        if (fault === 'caught') await view.savedSnapshot('agentica/publications/missing').catch(() => undefined);
        else void view.savedSnapshot(seeded.publication.reference.key).catch(() => undefined);
      };
      const error = await n.navigation.executeNavigationCommand(request, { host: {
        prepare: phase === 'prepare' ? fail : original.prepare,
        commit: async view => { if (phase === 'commit') { await fail(view); return {}; } return original.commit(view); },
      } }).catch(String);
      return { before, after: await c.dump(), error };
    }, { phase, fault });
    expect(String(r.error)).toContain('not usable'); expect(r.after).toBe(r.before);
  });
}

test('savedSnapshot works in both phases and its captured view closes after commit', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const original = await n.host(seeded.action); let captured: (() => Promise<unknown>) | undefined; const snapshots: CanonicalGameSnapshot[] = [];
    await n.navigation.executeNavigationCommand(request, { host: {
      prepare: async view => { snapshots.push((await view.savedSnapshot(seeded.publication.reference.key)).snapshot); await original.prepare(view); },
      commit: async view => { snapshots.push((await view.savedSnapshot(seeded.publication.reference.key)).snapshot);
        captured = () => view.savedSnapshot(seeded.publication.reference.key); return original.commit(view); },
    } });
    const before = await c.dump(), closed = await captured!().catch(String);
    return { snapshots, closed, before, after: await c.dump() };
  });
  expect(r.snapshots[0]).toEqual(r.snapshots[1]); expect(String(r.closed)).toContain('view is closed'); expect(r.after).toBe(r.before);
});

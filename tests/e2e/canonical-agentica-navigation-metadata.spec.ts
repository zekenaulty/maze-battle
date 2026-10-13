import { expect, test } from './canonical-agentica.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const field of ['request', 'head', 'operation', 'revision', 'progress', 'receiptRef'] as const)
  test(`async result builder mutation of ${field} cannot change movement source custody`, async ({ page }) => {
    const r = await page.evaluate(async field => {
      const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
      await n.navigation.executeNavigationCommand(await n.admission(seeded.target));
      const request = await n.advance(), identity = await c.prepareAction(seeded.action), before = await c.dump();
      const hook = c.navigationActionHooks(identity, async view => {
        await view.savedSnapshot(seeded.publication.reference.key);
        if (field === 'request') (view.request.input as JsonObject).extra = 'changed';
        if (field === 'head') { view.head.roots.world = 'changed'; view.head.owner = 'changed'; }
        if (field === 'operation') view.operation.id = 'changed';
        if (field === 'revision') view.head.revision = 999;
        if (field === 'progress') { view.progress.operationId = 'changed'; view.progress.sourceAttemptId = 'changed'; view.progress.steps = 999; }
        if (field === 'receiptRef') { view.receiptRef.attemptId = 'changed'; view.receiptRef.gameId = 'changed'; }
        return n.result(seeded.action, view);
      });
      const outcome = await n.navigation.executeNavigationCommand(request, { host: hook }).catch(String);
      const after = await c.dump(), destination = (await n.navigation.readDestination('trip')).value;
      const retained = (await c.read(seeded.action)).value!;
      const row = retained.resultReference ? (await c.readCanonical(p => p.get('execution', retained.resultReference!.key))).value! : null;
      return { request, outcome, before, after, destination, retained, source: row ? (row.value as JsonObject).sourceRequest : null,
        reconciliation: (await c.reconcile(seeded.action)).value, target: seeded.target };
    }, field);
    if (field === 'operation' || field === 'revision') {
      expect(String(r.outcome)).toMatch(/bind this operation commit|exceeds its commit revision/);
      expect(r.after).toBe(r.before); expect(r.destination.progress.steps).toBe(0);
      expect(r.retained.result).toBeNull(); expect(r.reconciliation!.status).toBe('pending');
    } else {
      expect(typeof r.outcome).not.toBe('string'); expect(r.source).toEqual(r.request);
      expect(r.destination.progress.steps).toBe(1); expect(r.destination.progress.position).toEqual(r.target);
      expect(r.destination.operation.id).toBe('trip');
      expect(r.reconciliation).toEqual({ status: 'completed', fingerprint: r.retained.original.fingerprint, result: r.retained.result });
    }
  });

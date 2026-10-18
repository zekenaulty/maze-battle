import { test, expect } from './canonical-test';

for (const defect of ['marker', 'null-marker', 'missing-head', 'foreign-head', 'allocation', 'missing-operation', 'witness', 'missing-source', 'policy-downgrade']) {
  test(`reset fails closed on ambiguous current custody: ${defect}`, async ({ page }) => {
    const r = await page.evaluate(async defect => {
      const c = window.canonical; let head = (await c.initializeCanonical('owner', {})).head;
      const request = c.command(head, 'operation.admit', { operationId: 'original', binding: {},
        terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' });
      await c.operateCanonical(request, 'admit', async () => null); head = (await c.readCanonicalHead()).head;
      const db = await c.openCanonicalDatabase(), key: [string, string] = [head.gameId, 'original'];
      if (defect === 'marker') await db.put('meta', { bad: true } as never, 'schema');
      if (defect === 'null-marker') await db.put('meta', { schema: 1, generation: head.generation, gameId: null }, 'schema');
      if (defect === 'missing-head') await db.delete('heads', head.gameId);
      if (defect === 'foreign-head') await db.put('heads', { ...head, generation: 'other' }, head.gameId);
      if (defect === 'allocation') await db.put('heads', { ...head, allocations: {} }, head.gameId);
      if (defect === 'missing-operation') await db.delete('operations', key);
      if (defect === 'missing-source') await db.delete('receipts', [head.gameId, request.attemptId]);
      if (defect === 'witness' || defect === 'policy-downgrade') {
        const row = (await db.get('operations', key))!;
        if (defect === 'witness') row.witness = 'changed';
        else {
          const path = '/src/persistence/canonical/operationValidation.ts';
          const { sealOperation } = await import(/* @vite-ignore */ path) as typeof import('../../src/persistence/canonical/operationValidation');
          const { witness: _, ackPolicy: __, ...body } = row; Object.assign(row, sealOperation(body)); delete row.ackPolicy;
        }
        await db.put('operations', row, key);
      }
      db.close(); const before = await c.dump(), meter = c.storageProbe();
      const error = await c.resetCanonical('replacement', {}).then(() => '', String), proof = meter.finish();
      return { error, before, after: await c.dump(), proof };
    }, defect);
    expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.after).toEqual(r.before);
    expect(r.proof.operations.some(o => ['clear', 'add', 'put', 'delete'].includes(o.method))).toBe(false);
  });
}

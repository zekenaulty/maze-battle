import { expect, test } from './canonical-test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('restoring a historical operation cannot spend another reservation or repeat an effect', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, initial = await c.admitFixtureOperation();
    const original = (await c.readCanonical(p => p.liveOperation('operation-1'))).value!;
    const terminal = c.command(initial.head, 'operation.cancel', { operationId: 'operation-1' });
    await c.operateCanonical(terminal, 'cancel');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: 'operation-1', terminalAttemptId: terminal.attemptId }), 'acknowledge');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.admit', {
      operationId: 'operation-2', binding: { target: 'different-known-room' }, terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => null);
    const current = (await c.readCanonicalHead()).head, db = await c.openCanonicalDatabase();
    await db.put('operations', original, [current.gameId, original.id]); db.close();
    const before = await c.dump(); let invoked = false;
    const failure = await c.operateCanonical(c.command(current, 'operation.settle', { operationId: 'operation-1', disposition: 'completed' }),
      'settle', async () => { invoked = true; return 'duplicate'; }).catch(String);
    const after = await c.dump();
    await c.operateCanonical(c.command(current, 'operation.cancel', { operationId: 'operation-2' }), 'cancel');
    return { failure, invoked, before, after, second: (await c.readCanonical(p => p.liveOperation('operation-2'))).value };
  });
  expect(result.failure).toContain('allocation anchor changed'); expect(result.invoked).toBe(false);
  expect(result.after).toEqual(result.before); expect(result.second?.terminal?.disposition).toBe('cancelled');
});

for (const stage of ['admission', 'terminal']) for (const field of ['result', 'committedAt']) test(`${stage} source without ${field} cannot authorize release`, async ({ page }) => {
  const result = await page.evaluate(async ({ stage, field }) => {
    const c = window.canonical, setup = await c.admitFixtureOperation();
    const terminal = c.command(setup.head, 'operation.cancel', { operationId: 'operation-1' });
    await c.operateCanonical(terminal, 'cancel');
    const current = (await c.readCanonicalHead()).head, db = await c.openCanonicalDatabase();
    const id = stage === 'admission' ? setup.input.attemptId : terminal.attemptId;
    const row = (await db.get('receipts', [current.gameId, id]))!;
    Reflect.deleteProperty(row, field); await db.put('receipts', row, [current.gameId, id]); db.close();
    const before = await c.dump();
    const failure = await c.operateCanonical(c.command(current, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId: terminal.attemptId }), 'acknowledge').catch(String);
    return { failure, before, after: await c.dump() };
  }, { stage, field });
  expect(result.failure).toContain('invalid original receipt'); expect(result.after).toEqual(result.before);
});

test('unsupported request metadata is rejected before it can exceed the acknowledgement grant', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.admitFixtureOperation();
    const terminal = c.command(head, 'operation.cancel', { operationId: 'operation-1' }); await c.operateCanonical(terminal, 'cancel');
    const current = (await c.readCanonicalHead()).head;
    const ack = c.command(current, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId: terminal.attemptId });
    const before = await c.dump(); let failure = '';
    try { await c.operateCanonical({ ...ack, trace: '"'.repeat(6000) } as CanonicalRequest, 'acknowledge'); } catch (error) { failure = String(error); }
    const after = await c.dump(); await c.operateCanonical(ack, 'acknowledge');
    return { failure, before, after, current: (await c.readCanonicalHead()).head };
  });
  expect(result.failure).toContain('unsupported request fields'); expect(result.after).toEqual(result.before);
  expect(result.current.quota.reservedBytes).toBe(0);
});

test('maximum accepted identifiers and escaped binding still fit cancellation and acknowledgement allowances', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, owner = 'o'.repeat(128), id = 'i'.repeat(128);
    const { head } = await c.initializeCanonical(owner, {});
    const admission = c.command(head, 'operation.admit', { operationId: id, binding: { quoted: '"\\'.repeat(700) }, terminalBytes: c.MIN_TERMINAL_BYTES }, 'a'.repeat(128));
    await c.operateCanonical(admission, 'admit', async () => null);
    const before = (await c.readCanonicalHead()).head;
    const cancel = c.command(before, 'operation.cancel', { operationId: id }, 'c'.repeat(128)); await c.operateCanonical(cancel, 'cancel');
    const terminal = (await c.readCanonicalHead()).head;
    const ack = c.command(terminal, 'operation.acknowledge', { operationId: id, terminalAttemptId: cancel.attemptId }, 'k'.repeat(128));
    await c.operateCanonical(ack, 'acknowledge');
    const final = (await c.readCanonicalHead()).head;
    return { terminalBytes: terminal.quota.usedBytes - before.quota.usedBytes, acknowledgementBytes: final.quota.usedBytes - terminal.quota.usedBytes,
      final, dump: await c.dump() };
  });
  expect(result.terminalBytes).toBeLessThan(131072); expect(result.acknowledgementBytes).toBeLessThan(16384);
  expect(result.final.quota).toMatchObject({ reservedBytes: 0, reservations: 0, usedBytes: result.dump.bytes });
});

test('missing funded operation is corruption, not a fresh admission slot', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, setup = await c.admitFixtureOperation(), db = await c.openCanonicalDatabase();
    await db.delete('operations', [setup.head.gameId, 'operation-1']); db.close();
    return await c.operateCanonical(c.command(setup.head, 'operation.admit', setup.input.input), 'admit', async () => null).catch(String);
  });
  expect(result).toContain('missing funded operation');
});

test('old world snapshots remain readable after a newer operation reserves capacity', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, initial = await c.initializeCanonical('owner', {}, async pages => { await pages.set('world', 'room', { open: false }); });
    const old = c.snapshotOf(initial.head);
    await c.operateCanonical(c.command(initial.head, 'operation.admit', { operationId: 'new-operation', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }),
      'admit', async tx => { await tx.pages.set('world', 'room', { open: true }); return null; });
    return { past: await c.readCanonical(p => p.get('world', 'room'), { snapshot: old }), current: await c.readCanonical(p => p.get('world', 'room')) };
  });
  expect(result.past.value?.value).toEqual({ open: false }); expect(result.current.value?.value).toEqual({ open: true });
  expect(result.past.head.quota.reservations).toBe(1); expect(result.past.snapshot.revision).toBeLessThan(result.current.head.revision);
});

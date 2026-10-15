// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CanonicalReceipt, CanonicalRequest } from '../types';
import type { ConfirmedOperation } from './event.records';
import type { OperationRead } from './operation.types';
import type { RetainedTransfer } from './transfer.records';
import { loadTransferAdoptions, transferAdoptionId } from './transfer.adoption';

function fixture() {
  const expected = { generation: 'generation', gameId: 'game', owner: 'new-owner', epoch: 3, revision: 12 };
  const transfer = { reference: { key: 'intent', id: 'immutable-intent' }, source: { expected } } as RetainedTransfer;
  const confirmed = { bound: { launch: { guard: { id: 'guard-id' } }, operation: { id: 'navigation-id' } } } as ConfirmedOperation;
  const rows = new Map<string, { source: CanonicalRequest; receipt: CanonicalReceipt }>();
  for (const [i, kind] of (['guard', 'navigation'] as const).entries()) {
    const attemptId = transferAdoptionId(transfer, kind), operationId = `${kind}-id`;
    const source: CanonicalRequest = { attemptId, expected: { ...expected, revision: 12 + i }, operation: 'operation.adopt', input: { operationId }, deadlineAt: null };
    rows.set(attemptId, { source, receipt: { attemptId, generation: 'generation', gameId: 'game', beforeRevision: 12 + i,
      afterRevision: 13 + i, result: { operationId, phase: 'adopt' }, committedAt: '2026-10-15T00:00:00.000Z', fingerprint: JSON.stringify(source) } });
  }
  const pages = { async sourceReceipt(id: string) { const row = rows.get(id); if (!row) throw Error('Missing exact adopt receipt'); return row; } } as OperationRead;
  return { transfer, confirmed, rows, pages, load: () => loadTransferAdoptions(pages, confirmed, transfer, 12) };
}
describe('explicit transfer kernel receipt binding', () => {
  it('loads exactly two named receipts without scanning any history', async () => {
    const f = fixture(), result = await f.load();
    expect(result.guard.source.attemptId).toBe('immutable-intent:guard');
    expect(result.navigation.receipt.afterRevision).toBe(14);
  });
  for (const kind of ['guard', 'navigation'] as const) {
    it(`${kind} mutable ownership is insufficient without its named receipt`, async () => {
      const f = fixture(); f.rows.delete(transferAdoptionId(f.transfer, kind)); await expect(f.load()).rejects.toThrow('Missing exact adopt receipt');
    });
    it.each(['operation', 'operationId', 'generation', 'gameId', 'owner', 'epoch', 'deadline', 'beforeAck', 'result'])
      (`rejects changed ${kind} %s`, async changed => {
        const f = fixture(), row = f.rows.get(transferAdoptionId(f.transfer, kind))!;
        if (changed === 'operation') row.source.operation = 'operation.admit';
        if (changed === 'operationId') row.source.input = { operationId: 'foreign' };
        if (changed === 'generation' || changed === 'gameId' || changed === 'owner') row.source.expected[changed] = 'foreign';
        if (changed === 'epoch') row.source.expected.epoch++;
        if (changed === 'deadline') row.source.deadlineAt = 1;
        if (changed === 'beforeAck') row.receipt.beforeRevision = 11;
        if (changed === 'result') row.receipt.result = { operationId: `${kind}-id`, phase: 'cancel' };
        await expect(f.load()).rejects.toThrow('explicit transfer adoption receipt changed');
      });
  }
  it('requires guard adoption before navigation adoption', async () => {
    const f = fixture(); f.rows.get('immutable-intent:navigation')!.receipt.beforeRevision = 12;
    await expect(f.load()).rejects.toThrow('order changed');
  });
});

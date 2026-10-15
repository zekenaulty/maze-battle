import { check, validId } from '../validation';
import type { ConfirmedOperation } from './event.records';
import type { OperationRead } from './operation.types';
import type { RetainedTransfer } from './transfer.records';
import { equal } from './validation';

export type TransferAdoptionKind = 'guard' | 'navigation';
/** The intent's immutable record ID names both kernel attempts, including after a lost reply. */
export function transferAdoptionId(transfer: RetainedTransfer, kind: TransferAdoptionKind) {
  const id = `${transfer.reference.id}:${kind}`;
  check(validId(id), 'invalid transfer adoption attempt'); return id;
}
export async function loadTransferAdoption(pages: OperationRead, confirmed: ConfirmedOperation, transfer: RetainedTransfer,
  ackRevision: number, kind: TransferAdoptionKind) {
  const attemptId = transferAdoptionId(transfer, kind), { source, receipt } = await pages.sourceReceipt(attemptId);
  const operationId = kind === 'guard' ? confirmed.bound.launch.guard.id : confirmed.bound.operation.id;
  const target = transfer.source.expected, fence = source.expected;
  check(source.operation === 'operation.adopt' && source.deadlineAt === null && equal(source.input, { operationId })
    && fence.gameId === target.gameId && fence.generation === target.generation && fence.owner === target.owner && fence.epoch === target.epoch
    && receipt.beforeRevision >= ackRevision && equal(receipt.result, { operationId, phase: 'adopt' }), 'explicit transfer adoption receipt changed');
  return { source, receipt };
}
export async function loadTransferAdoptions(pages: OperationRead, confirmed: ConfirmedOperation, transfer: RetainedTransfer, ackRevision: number) {
  const guard = await loadTransferAdoption(pages, confirmed, transfer, ackRevision, 'guard');
  const navigation = await loadTransferAdoption(pages, confirmed, transfer, ackRevision, 'navigation');
  check(navigation.receipt.beforeRevision >= guard.receipt.afterRevision, 'transfer kernel adoption order changed');
  return { guard, navigation };
}

import type { DirectedReceipt, DirectedRequest } from '../../domain/directed/operationTypes';
import type { DirectedTransaction, SaveRecord } from './database';
import { receipt } from './journalValidation';
import { receipts } from './records';
import { check, same } from './values';
import { readIdentity, reserveIdentity, verifyWitness, witness } from './witnesses';
import { validateReceiptEvidence } from './receiptEvidence';

export async function originalReceipt(tx: DirectedTransaction, slot: string, request: DirectedRequest, record: SaveRecord) {
  const value = record.terminalAttempt === request.attemptId
    ? (await tx.objectStore('controlReserve').get(slot))?.receipt
    : await tx.objectStore('receipts').get([slot, request.attemptId]);
  if (!value) { check(record.terminalAttempt !== request.attemptId, 'missing terminal receipt'); return undefined; }
  receipt(value, record.session);
  if (record.historyMode) await verifyWitness(tx, slot, 'receipts', request.attemptId, value);
  check(same(value.request, request), 'attempt ID payload conflict');
  await validateReceiptEvidence(tx, slot, record, value);
  return value;
}
export async function assertUnusedOperation(tx: DirectedTransaction, slot: string, request: DirectedRequest, record: SaveRecord) {
  const legacyReceipts = record.historyMode ? [] : await receipts(tx, slot, record);
  if (request.command.type !== 'navigate') return;
  const operationId = request.command.operationId;
  check(record.session.operation?.id !== operationId, 'operation ID already used');
  if (record.historyMode) {
    check(await readIdentity(tx, slot, 'operations', operationId) === undefined, 'operation ID already used');
  } else {
    check(!legacyReceipts.some(value => value.request.command.type === 'navigate'
      && value.request.command.operationId === operationId), 'operation ID already used');
  }
}
export async function storeReceipt(tx: DirectedTransaction, slot: string, record: SaveRecord, value: DirectedReceipt, terminal: boolean) {
  if (terminal) {
    const reserve = await tx.objectStore('controlReserve').get(slot);
    check(record.historyMode && !record.terminalAttempt && reserve?.padding && !reserve.receipt
      && value.request.command.type === 'cancel' && value.result.status === 'applied'
      && value.result.operation?.status === 'cancelled', 'cancellation reserve unavailable');
    await tx.objectStore('controlReserve').put({ receipt: value }, slot);
    record.terminalAttempt = value.request.attemptId;
  } else {
    await tx.objectStore('receipts').add(value, [slot, value.request.attemptId]);
    record.counts.receipts++;
  }
  if (record.historyMode) {
    await witness(tx, slot, 'receipts', value.request.attemptId, value);
    if (value.request.command.type === 'navigate') {
      await reserveIdentity(tx, slot, 'operations', value.request.command.operationId, value.request.attemptId);
    }
  }
}

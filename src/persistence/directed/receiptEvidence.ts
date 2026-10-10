import type { DirectedReceipt } from '../../domain/directed/operationTypes';
import type { ObservationReceipt } from '../../domain/directed/types';
import { slotRange, type DirectedTransaction, type SaveRecord } from './database';
import { observation } from './stateValidation';
import { event } from './journalValidation';
import { check, same } from './values';
import { readIdentity, verifyWitness } from './witnesses';

export function inspectionReceiptEvidence(receipt: DirectedReceipt, sources: ObservationReceipt[]) {
  const inspection = sources.filter(source => source.reason === 'inspection' || source.scene.inspection);
  const applied = receipt.result.status === 'applied' && receipt.request.command.type === 'inspect';
  if (!applied) { check(!inspection.length, 'inspection source contradicts receipt command'); return; }
  const source = inspection[0], command = receipt.request.command;
  check(command.type === 'inspect' && sources.length === 1 && inspection.length === 1 && !receipt.eventIds.length
    && source.scene.inspection?.attemptId === receipt.request.attemptId
    && source.scene.inspection.direction === command.direction
    && same(source.scene.position, receipt.result.position), 'inspection receipt differs from source attempt');
}

/** Exact replay checks the evidence it actually references, without a lifetime journal scan in checkpoint mode. */
export async function validateReceiptEvidence(tx: DirectedTransaction, slot: string, record: SaveRecord, value: DirectedReceipt) {
  const sources: ObservationReceipt[] = [];
  const legacy = !record.historyMode && value.observationIds.length
    ? await tx.objectStore('observations').getAll(slotRange(slot)) : [];
  for (const id of value.observationIds) {
    const key = record.historyMode ? await readIdentity(tx, slot, 'observations', id) : undefined;
    const source = record.historyMode && typeof key === 'number'
      ? await tx.objectStore('observations').get([slot, key]) : legacy.find(source => source.id === id);
    observation(source, record.session);
    check(source.id === id && (!record.historyMode || source.sequence === key), 'receipt observation identity mismatch');
    if (record.historyMode) await verifyWitness(tx, slot, 'observations', source.sequence, source);
    sources.push(source);
  }
  if (record.historyMode) for (const id of value.eventIds) {
    const key = await readIdentity(tx, slot, 'events', id);
    check(typeof key === 'number', 'missing receipt event');
    const source = await tx.objectStore('events').get([slot, key]);
    event(source, record.session);
    check(source.id === id && source.revision === key, 'receipt event identity mismatch');
    await verifyWitness(tx, slot, 'events', key, source);
  }
  inspectionReceiptEvidence(value, sources);
}

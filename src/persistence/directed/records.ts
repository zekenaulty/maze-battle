import { DIRECTED_LIMITS } from '../../domain/directed/types';
import { JOURNALS, slotRange, type Counts, type DirectedTransaction, type SaveRecord } from './database';
import { receipt } from './journalValidation';
import { validateLineage } from './lineage';
import { session, world } from './stateValidation';
import { check, integer, keys, object, same } from './values';
import { validateCheckpoint } from './checkpoints';

export async function validateCounts(tx: DirectedTransaction, slot: string, record: SaveRecord) {
  for (const name of JOURNALS) check(await tx.objectStore(name).count(slotRange(slot)) === record.counts[name], `missing or extra ${name}`);
}

export async function load(tx: DirectedTransaction, slot: string): Promise<SaveRecord | undefined> {
  const rows = await tx.objectStore('saves').getAll(slot, 1);
  if (!rows.length) {
    check(await tx.objectStore('worlds').count(slot) === 0, 'orphan world without save');
    for (const name of JOURNALS) check(await tx.objectStore(name).count(slotRange(slot)) === 0, 'orphan journal without save');
    for (const name of ['witnesses', 'identities'] as const) check(await tx.objectStore(name).count(slotRange(slot)) === 0, 'orphan checkpoint without save');
    check(await tx.objectStore('controlReserve').count(slot) === 0, 'orphan control reserve without save');
    return undefined;
  }
  const record = rows[0];
  object(record); keys(record, ['session', 'counts'], ['historyMode', 'terminalAttempt']); session(record.session);
  check(record.historyMode === undefined || record.historyMode === 'checkpoint-v1', 'unsupported history mode');
  check(record.terminalAttempt === undefined || (record.historyMode && typeof record.terminalAttempt === 'string'), 'invalid terminal receipt pointer');
  object(record.counts); keys(record.counts, [...JOURNALS]);
  for (const name of JOURNALS) {
    integer(record.counts[name], DIRECTED_LIMITS.history);
  }
  check(record.counts.observations === record.session.knowledge.revision
    && record.counts.projections === record.counts.observations + 1
    && record.counts.events === record.session.world.revision, 'journal sequence mismatch');
  const storedWorld = await tx.objectStore('worlds').get(slot);
  world(storedWorld); check(same(storedWorld, record.session.world), 'world checkpoint mismatch');
  if (record.historyMode) await validateCheckpoint(tx, slot, record);
  else { await validateCounts(tx, slot, record); await validateLineage(tx, slot, record); }
  return record;
}
export async function requireSave(tx: DirectedTransaction, slot: string): Promise<SaveRecord> {
  const record = await load(tx, slot);
  check(record !== undefined, 'missing save');
  return record;
}
export function capacity(counts: Counts, additions: Partial<Counts>) {
  for (const name of JOURNALS) integer(counts[name] + (additions[name] ?? 0), DIRECTED_LIMITS.history);
}
export async function receipts(tx: DirectedTransaction, slot: string, record: SaveRecord) {
  const store = tx.objectStore('receipts');
  const values = await store.getAll(slotRange(slot), DIRECTED_LIMITS.history + 1);
  const keys = await store.getAllKeys(slotRange(slot), DIRECTED_LIMITS.history + 1);
  check(values.length === record.counts.receipts, 'receipt count mismatch');
  values.forEach((value, index) => {
    receipt(value, record.session);
    check(keys[index][1] === value.request.attemptId, 'receipt key mismatch');
  });
  return values;
}

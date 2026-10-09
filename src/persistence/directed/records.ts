import { DIRECTED_LIMITS } from '../../domain/directed/types';
import { JOURNALS, slotRange, type Counts, type DirectedTransaction, type SaveRecord } from './database';
import { receipt } from './journalValidation';
import { projection, session, world } from './stateValidation';
import { check, integer, keys, object, same } from './values';

export async function load(tx: DirectedTransaction, slot: string): Promise<SaveRecord | undefined> {
  const rows = await tx.objectStore('saves').getAll(slot, 1);
  if (!rows.length) {
    check(await tx.objectStore('worlds').count(slot) === 0, 'orphan world without save');
    for (const name of JOURNALS) check(await tx.objectStore(name).count(slotRange(slot)) === 0, 'orphan journal without save');
    return undefined;
  }
  const record = rows[0];
  object(record); keys(record, ['session', 'counts']); session(record.session);
  object(record.counts); keys(record.counts, [...JOURNALS]);
  for (const name of JOURNALS) {
    integer(record.counts[name], DIRECTED_LIMITS.history);
    check(await tx.objectStore(name).count(slotRange(slot)) === record.counts[name], `missing or extra ${name}`);
  }
  check(record.counts.observations === record.session.knowledge.revision
    && record.counts.projections === record.counts.observations + 1
    && record.counts.events === record.session.world.revision, 'journal sequence mismatch');
  const storedWorld = await tx.objectStore('worlds').get(slot);
  world(storedWorld); check(same(storedWorld, record.session.world), 'world checkpoint mismatch');
  const latest = await tx.objectStore('projections').get([slot, record.session.knowledge.revision]);
  projection(latest); check(same(latest, record.session.knowledge), 'projection checkpoint mismatch');
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

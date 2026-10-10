import { DIRECTED_LIMITS } from '../../domain/directed/types';
import { JOURNALS, transaction, type DirectedTransaction, type SaveRecord } from './database';
import { context, event, receipt } from './journalValidation';
import { observation, projection } from './stateValidation';
import { requireSave } from './records';
import { check, id, integer, utf8Bytes } from './values';
import { verifyWitness } from './witnesses';

export type DirectedJournal = typeof JOURNALS[number];
export interface HistoryPageQuery { journal: DirectedJournal; after?: string | number; limit?: number; maxBytes?: number }

async function validateEntry(tx: DirectedTransaction, slot: string, record: SaveRecord,
  name: DirectedJournal, key: string | number, value: unknown) {
  if (name === 'observations') { observation(value, record.session); check(value.sequence === key, 'source key mismatch'); }
  else if (name === 'projections') { projection(value); check(value.revision === key, 'projection key mismatch'); }
  else if (name === 'events') { event(value, record.session); check(value.revision === key, 'event key mismatch'); }
  else if (name === 'contexts') { context(value, record.session); check(value.id === key, 'context key mismatch'); }
  else { receipt(value, record.session); check(value.request.attemptId === key, 'receipt key mismatch'); }
  if (record.historyMode) await verifyWitness(tx, slot, name, key, value);
}

/** Host audit surface, not actor context: sources include audit-only world revisions. */
export async function readDirectedHistoryPage(slot: string, input: HistoryPageQuery) {
  id(slot); check(input && JOURNALS.includes(input.journal), 'invalid journal');
  const { journal, after, limit = 16, maxBytes = DIRECTED_LIMITS.bytes } = structuredClone(input);
  integer(limit, 32); integer(maxBytes, DIRECTED_LIMITS.bytes * 8);
  check(limit > 0 && maxBytes >= 1024, 'invalid page budget');
  const numeric = ['observations', 'projections', 'events'].includes(journal);
  if (after !== undefined) { if (numeric) integer(after); else id(after); }
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const range = IDBKeyRange.bound(after === undefined ? [slot] : [slot, after], [slot, []], after !== undefined);
    let cursor = await tx.objectStore(journal).openCursor(range);
    const entries: { key: string | number; value: unknown }[] = [];
    let next: string | number | undefined = after;
    while (cursor && entries.length < limit) {
      const key = cursor.key[1], value = cursor.value;
      await validateEntry(tx, slot, record, journal, key, value);
      const candidate = { key, value };
      if (utf8Bytes(JSON.stringify({ entries: [...entries, candidate], next: key, complete: false })) > maxBytes) break;
      entries.push(candidate); next = key;
      cursor = await cursor.continue();
    }
    const result = { entries, next, complete: !cursor, ...(cursor && !entries.length ? { limitation: 'entry-exceeds-byte-budget' as const } : {}) };
    check(utf8Bytes(JSON.stringify(result)) <= maxBytes, 'page envelope exceeds budget');
    return result;
  });
}

import type { CanonicalPages } from '../../src/persistence/canonical/pages';
import type { CanonicalRequest, JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readPublication } from '../../src/persistence/canonical/agentica/publication';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { blockKey, localKey, observationKey } from '../../src/persistence/canonical/knowledge/keys';

export interface Access { method: string; area: string; key: string }
/** Instrument only the actual publication callback, not setup or GameSession's ordinary projection. */
export function boundedPages(pages: CanonicalPages, questId: string, reads: Access[], onFirstRead?: () => void): CanonicalPages {
  let first = true;
  return new Proxy(pages, { get(target, name) {
    if (['get', 'witness', 'scan', 'set', 'delete'].includes(String(name))) {
      return (area: string, key: string, ...args: unknown[]) => {
        reads.push({ method: String(name), area, key });
        if (name === 'scan' || name === 'delete') throw Error('Binding must not scan or delete');
        if (name === 'set' && (area !== 'execution' || !key.startsWith('agentica/publications/')))
          throw Error('Binding must only retain its publication');
        if (area === 'world' && (name !== 'get' || ![`quest/${questId}`, `contract/${questId}`].includes(key)))
          throw Error(`Hidden world access: ${key}`);
        if (area === 'knowledge' && !key.startsWith('perception/')) throw Error(`Foreign knowledge read: ${key}`);
        if (first) { first = false; onFirstRead?.(); }
        return Reflect.apply(Reflect.get(target, name) as (...args: unknown[]) => unknown, target, [area, key, ...args]);
      };
    }
    const value = Reflect.get(target, name);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export async function proof(ref: ProtocolRef) {
  return (await readCanonical(async pages => {
    const publication = await readPublication(pages, ref);
    const saved = await pages.savedSnapshot(ref.key);
    const { receipt } = await pages.sourceReceipt(saved.source.attemptId);
    return { publication, record: saved.record, source: saved.source, receipt };
  })).value;
}
/** Independent native-store oracle includes receipts, records, allocations and the selected world row. */
export async function nativeState() {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    return { head, operations: await db.getAll('operations'), receipts: await db.getAll('receipts'),
      records: await db.getAll('records') };
  } finally { db.close(); }
}
export async function originalSight() {
  return (await readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint), row = await pages.get('knowledge', observationKey(1));
    if (!row) throw Error('Missing initial earned observation');
    const sight = await loadObservation(pages, { sequence: 1, id: row.id });
    const index = sight.cells.findIndex(cell => cell.stairs.includes('town'));
    if (index < 0) throw Error('Fixture initial sight lacks town');
    return { entrance: { at: sight.cells[index].at, source: { sequence: 1, id: row.id, index } }, checkpoint, count: sight.cells.length };
  })).value;
}
/** Negative-only native record faults. No invented objective, source anchor or successful grant. */
export async function removeEntranceEvidence(kind: 'source' | 'memory') {
  const { head } = await readCanonicalHead(), checkpoint = gameCheckpoint(head.checkpoint);
  const selected = await originalSight(), db = await openCanonicalDatabase();
  try {
    const key = kind === 'source' ? observationKey(checkpoint.knowledge!.sequence) : blockKey(selected.entrance.at);
    const rows = await db.getAll('records');
    const row = rows.filter(row => row.area === 'knowledge' && row.key === key).sort((a, b) => b.revision - a.revision)[0];
    if (!row) throw Error('Missing native fault target');
    if (kind === 'source') await db.delete('records', [head.gameId, row.id]);
    else {
      const cells = (row.value as JsonObject).cells as JsonObject;
      delete cells[localKey(selected.entrance.at)];
      await db.put('records', row, [head.gameId, row.id]);
    }
    return { key, id: row.id };
  } finally { db.close(); }
}
export function selection(request: CanonicalRequest) {
  return (request.input as JsonObject).returnQuest as { launchId: string; objectiveId: string; questId: string };
}

import { openCanonicalDatabase } from './database';
import { workBudget } from './budget';
import { CanonicalPages } from './pages';
import { operationAt } from './operations';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalSnapshot, type CanonicalWorkLimits, type RecordArea } from './types';
import { check, head, jsonBytes, marker, snapshot as validateSnapshot } from './validation';

export type CanonicalQuery = Pick<CanonicalPages, 'get' | 'scan' | 'witness' | 'savedSnapshot' | 'sourceReceipt'> & {
  liveOperation(id: string): ReturnType<typeof operationAt>;
};
type Options = { snapshot?: CanonicalSnapshot; limits?: CanonicalWorkLimits; signal?: AbortSignal };

export const snapshotOf = (value: CanonicalHead): CanonicalSnapshot => structuredClone({ generation: value.generation,
  gameId: value.gameId, revision: value.revision, roots: value.roots, checkpoint: value.checkpoint });

/** Internal game-owned roots, not provider-supplied capabilities. A snapshot never refreshes unseen facts. */
export async function readCanonical<T>(query: (pages: CanonicalQuery, snapshot: CanonicalSnapshot) => Promise<T>, options: Options = {}) {
  if (options.snapshot) jsonBytes(options.snapshot, 8192);
  const signal = options.signal, snapshot = options.snapshot ? structuredClone(options.snapshot) : undefined, budget = workBudget(options.limits, signal);
  budget.alive();
  const db = await openCanonicalDatabase(signal), tx = db.transaction(CANONICAL_STORES, 'readonly');
  void tx.done.catch(() => {});
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    budget.read();
    const schema = await tx.objectStore('meta').get('schema'); marker(schema); budget.received(jsonBytes(schema));
    check(schema.gameId !== null, 'game has not been initialized');
    budget.read();
    const current = await tx.objectStore('heads').get(schema.gameId); head(current, { generation: schema.generation, gameId: schema.gameId });
    budget.received(jsonBytes(current));
    if (snapshot) validateSnapshot(snapshot, current);
    const projected = snapshot ? { ...current, ...snapshot } : current;
    const pages = new CanonicalPages(tx, projected, budget);
    let operationFailed = false, pendingOperations = 0;
    const liveOperation = async (id: string) => {
      pendingOperations++;
      try {
        check(!snapshot, 'live operation is unavailable in a historical snapshot');
        return await operationAt(tx, current, id, budget);
      }
      catch (error) { operationFailed = true; throw error; }
      finally { pendingOperations--; }
    };
    const view = snapshotOf(projected), value = await query({ get: pages.get.bind(pages), scan: pages.scan.bind(pages),
      witness: pages.witness.bind(pages), savedSnapshot: pages.savedSnapshot.bind(pages), sourceReceipt: pages.sourceReceipt.bind(pages), liveOperation }, structuredClone(view));
    check(!operationFailed && pendingOperations === 0, 'operation read is not usable');
    pages.finishRead(); budget.alive(); await tx.done;
    return { head: current, snapshot: view, value, stats: budget.snapshot() };
  } catch (error) { abort(); await tx.done.catch(() => {}); budget.alive(); throw error; }
  finally { signal?.removeEventListener('abort', abort); db.close(); }
}

export const readCanonicalHead = () => readCanonical(async () => undefined);

export interface RecordCursor { snapshot: CanonicalSnapshot; area: RecordArea; prefix: string; after: string }
export function listCanonical(area: RecordArea, prefix: string, limit = 16, cursor?: RecordCursor) {
  if (cursor) {
    jsonBytes(cursor, 8192);
    check(cursor.area === area && cursor.prefix === prefix, 'cursor query changed');
    cursor = structuredClone(cursor);
  }
  const after = cursor?.after;
  return readCanonical(async (pages, snapshot) => {
    const page = await pages.scan(area, prefix, after, limit);
    return { rows: page.rows, ...(page.next === undefined ? {} : { next: { snapshot, area, prefix, after: page.next } }) };
  }, { snapshot: cursor?.snapshot });
}

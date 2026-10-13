import { openCanonicalDatabase } from './database';
import { accountHead, appendedBytes } from './accounting';
import { workBudget } from './budget';
import { CanonicalPages } from './pages';
import { CANONICAL_STORES, DEFAULT_QUOTA, type CanonicalHead, type CanonicalWorkLimits, type JsonObject } from './types';
import { check, checkpoint, head, jsonBytes, marker, validId } from './validation';

type Initializer = (pages: CanonicalPages) => Promise<void>;
type Options = { quota?: typeof DEFAULT_QUOTA; limits?: CanonicalWorkLimits; signal?: AbortSignal };

/** Only for an empty new schema; never replaces an existing game. */
export function initializeCanonical(owner: string, initial: JsonObject, seed?: Initializer, options: Options = {}) {
  return create(false, owner, initial, seed, options);
}

/** Explicit destructive action: no old data is read, repaired or carried forward. */
export function resetCanonical(owner: string, initial: JsonObject, seed?: Initializer, options: Options = {}) {
  return create(true, owner, initial, seed, options);
}

async function create(reset: boolean, owner: string, initial: JsonObject, seed: Initializer | undefined, options: Options) {
  check(validId(owner), 'invalid owner');
  const signal = options.signal, state = checkpoint(initial), quota = { ...(options.quota ?? DEFAULT_QUOTA) }, budget = workBudget(options.limits, signal);
  budget.alive();
  const db = await openCanonicalDatabase(signal), tx = db.transaction(CANONICAL_STORES, 'readwrite', { durability: 'strict' });
  void tx.done.catch(() => {});
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    budget.alive();
    let generation: string;
    if (reset) {
      generation = crypto.randomUUID();
    } else {
      budget.read();
      const schema = await tx.objectStore('meta').get('schema'); marker(schema); budget.received(jsonBytes(schema));
      check(schema.gameId === null, 'game already exists'); generation = schema.generation;
    }
    const current: CanonicalHead = { schema: 1, generation, gameId: crypto.randomUUID(), owner, epoch: 1, revision: 0,
      status: 'ready', roots: { world: null, knowledge: null, execution: null }, checkpoint: state, quota: { ...quota, usedBytes: 0 } };
    head(current);
    const pages = new CanonicalPages(tx, current, budget);
    await seed?.(pages);
    const staged = await pages.prepare();
    const next = accountHead(undefined, { ...current, revision: 1, roots: staged.roots }, appendedBytes(staged.records, staged.nodes));
    const schema = { schema: 1 as const, generation, gameId: next.gameId };
    budget.write(jsonBytes(next)); budget.write(jsonBytes(schema));
    // Stage everything before any destructive write. An illegal external await can
    // close the transaction, but it must never commit an empty replacement game.
    if (reset) for (const name of CANONICAL_STORES) { budget.write(0); await tx.objectStore(name).clear(); }
    for (const row of staged.records) await tx.objectStore('records').add(row, [row.gameId, row.id]);
    for (const row of staged.nodes) await tx.objectStore('nodes').add(row, [row.gameId, row.node.id]);
    await tx.objectStore('heads').add(next, next.gameId);
    await tx.objectStore('meta').put(schema, 'schema');
    budget.alive(); await tx.done;
    return { head: next, stats: budget.snapshot() };
  } catch (error) { abort(); await tx.done.catch(() => {}); budget.alive(); throw error; }
  finally { signal?.removeEventListener('abort', abort); db.close(); }
}

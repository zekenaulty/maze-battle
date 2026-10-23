import { openCanonicalDatabase } from './database';
import { accountHead, appendedBytes } from './accounting';
import { workBudget } from './budget';
import { CanonicalPages } from './pages';
import { requireResetClearance } from './resetGuard';
import { emptyPrivateCapacity } from './privateCapacity';
import { PrivatePreparation, type PrivatePreparationSpec } from './privatePreparation';
import { CANONICAL_STORES, DEFAULT_QUOTA, type CanonicalReceipt, type CanonicalRequest, type CanonicalWorkLimits, type JsonObject } from './types';
import { check, checkpoint, fingerprint, head, jsonBytes, marker, result, validId } from './validation';

type Initializer = (pages: CanonicalPages) => Promise<void>;
type Options = { quota?: typeof DEFAULT_QUOTA; limits?: CanonicalWorkLimits; signal?: AbortSignal;
  privatePreparation?: PrivatePreparationSpec };

/** Only for an empty new schema; never replaces an existing game. */
export function initializeCanonical(owner: string, initial: JsonObject, seed?: Initializer, options: Options = {}) {
  return create(false, owner, initial, seed, options);
}

/** Explicit discard, fenced by current obligations. No old schema is read or migrated. */
export function resetCanonical(owner: string, initial: JsonObject, seed?: Initializer, options: Options = {}) {
  return create(true, owner, initial, seed, options);
}

async function create(reset: boolean, owner: string, initial: JsonObject, seed: Initializer | undefined, options: Options) {
  check(validId(owner), 'invalid owner');
  const signal = options.signal, state = checkpoint(initial), quota = { ...(options.quota ?? DEFAULT_QUOTA) }, budget = workBudget(options.limits, signal);
  const allocation = options.privatePreparation && structuredClone(options.privatePreparation);
  budget.alive();
  const db = await openCanonicalDatabase(signal), tx = db.transaction(CANONICAL_STORES, 'readwrite', { durability: 'strict' });
  void tx.done.catch(() => {});
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    budget.alive();
    let generation: string;
    if (reset) {
      await requireResetClearance(tx, budget);
      generation = crypto.randomUUID();
    } else {
      budget.read();
      const schema = await tx.objectStore('meta').get('schema'); marker(schema); budget.received(jsonBytes(schema));
      check(schema.gameId === null, 'game already exists'); generation = schema.generation;
    }
    const current = accountHead(undefined, { schema: 1, generation, gameId: crypto.randomUUID(), owner, epoch: 1, revision: 0,
      status: 'ready', roots: { world: null, knowledge: null, execution: null }, checkpoint: state, allocations: {},
      quota: { ...quota, usedBytes: 0, reservedBytes: 0, reservations: 0, privateCapacity: emptyPrivateCapacity() } }, 0);
    head(current);
    const pages = new CanonicalPages(tx, current, budget);
    const source: CanonicalRequest | undefined = allocation && { attemptId: crypto.randomUUID(),
      expected: { generation, gameId: current.gameId, owner, epoch: 1, revision: 0 }, operation: 'game.initialize',
      input: { allocation: { id: allocation.id, budgetBytes: allocation.budgetBytes, policy: allocation.policy } }, deadlineAt: null };
    const preparation = source && new PrivatePreparation(current, pages, source);
    if (preparation && allocation) await preparation.begin(allocation, () => true);
    await seed?.(pages);
    preparation?.assertUsable();
    const staged = await pages.prepare();
    const receipt: CanonicalReceipt | undefined = source && preparation && {
      generation, gameId: current.gameId, attemptId: source.attemptId, fingerprint: fingerprint(source),
      beforeRevision: 0, afterRevision: 1, committedAt: new Date().toISOString(), result: result(preparation.decorate({ kind: 'initialize' })),
    };
    const addedBytes = appendedBytes(staged.records, staged.nodes, receipt);
    const next = accountHead(undefined, { ...current, revision: 1, roots: staged.roots,
      quota: preparation ? { ...current.quota, privateCapacity: preparation.finish(addedBytes) } : current.quota }, addedBytes);
    preparation?.assertUsable();
    const schema = { schema: 1 as const, generation, gameId: next.gameId };
    budget.write(jsonBytes(next)); budget.write(jsonBytes(schema));
    if (receipt) budget.write(jsonBytes(receipt));
    // Stage everything before any destructive write. An illegal external await can
    // close the transaction, but it must never commit an empty replacement game.
    if (reset) for (const name of CANONICAL_STORES) { budget.write(0); await tx.objectStore(name).clear(); }
    for (const row of staged.records) await tx.objectStore('records').add(row, [row.gameId, row.id]);
    for (const row of staged.nodes) await tx.objectStore('nodes').add(row, [row.gameId, row.node.id]);
    if (receipt) await tx.objectStore('receipts').add(receipt, [receipt.gameId, receipt.attemptId]);
    await tx.objectStore('heads').add(next, next.gameId);
    await tx.objectStore('meta').put(schema, 'schema');
    budget.alive(); await tx.done;
    return { head: next, stats: budget.snapshot() };
  } catch (error) { abort(); await tx.done.catch(() => {}); budget.alive(); throw error; }
  finally { signal?.removeEventListener('abort', abort); db.close(); }
}

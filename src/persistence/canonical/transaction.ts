import { openCanonicalDatabase } from './database';
import { workBudget } from './budget';
import { CanonicalPages } from './pages';
import { accountHead, appendedBytes } from './accounting';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalReceipt, type CanonicalRequest, type CanonicalWorkLimits, type Json, type JsonObject } from './types';
import { check, checkpoint, deadline, fingerprint, head, identity, integer, isObject, jsonBytes, marker, request, result, sameFence, validId } from './validation';

export interface CanonicalWork {
  readonly head: CanonicalHead;
  readonly pages: CanonicalPages;
  setCheckpoint(value: JsonObject): void;
}

type Options = { limits?: CanonicalWorkLimits; signal?: AbortSignal };
type Control = 'stop' | 'takeover' | 'resume';

/** Domain callbacks may await only transaction work, never network/timers. */
export function executeCanonical(input: CanonicalRequest, work: (tx: CanonicalWork) => Promise<Json>, options: Options = {}) {
  check(!input.operation.startsWith('control.'), 'reserved control operation');
  return run(input, work, options);
}

/** Host-only control entrypoint. Stop/takeover consume reserve at most once before normal admission resumes. */
export function controlCanonical(input: CanonicalRequest, action: Control, options: Options = {}) {
  const original = request(input);
  check(['stop', 'takeover', 'resume'].includes(action) && original.operation === `control.${action}`, 'invalid control action');
  check(isObject(original.input) && Object.keys(original.input).join() === 'owner' && validId(original.input.owner), 'invalid control owner');
  if (action !== 'takeover') check(original.input.owner === original.expected.owner, 'control owner mismatch');
  return run(original, async () => ({ status: action === 'resume' ? 'ready' : 'stopped' }), options, action);
}

async function run(input: CanonicalRequest, work: (tx: CanonicalWork) => Promise<Json>, options: Options, control?: Control) {
  const signal = options.signal, original = request(input), signature = fingerprint(original), budget = workBudget(options.limits, signal);
  budget.alive();
  const db = await openCanonicalDatabase(signal), tx = db.transaction(CANONICAL_STORES, 'readwrite', { durability: 'strict' });
  void tx.done.catch(() => {});
  const abort = () => { try { tx.abort(); } catch { /* Already settled. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    budget.alive();
    budget.read();
    const schema = await tx.objectStore('meta').get('schema'); marker(schema); budget.received(jsonBytes(schema));
    check(schema.generation === original.expected.generation && schema.gameId === original.expected.gameId, 'game generation changed');
    budget.read();
    const previousReceipt = await tx.objectStore('receipts').get([schema.gameId, original.attemptId]);
    budget.received(previousReceipt === undefined ? 0 : jsonBytes(previousReceipt));
    if (previousReceipt !== undefined) {
      identity(previousReceipt, original.expected);
      check(previousReceipt.attemptId === original.attemptId && previousReceipt.fingerprint === signature
        && previousReceipt.beforeRevision === original.expected.revision && previousReceipt.afterRevision === previousReceipt.beforeRevision + 1
        && typeof previousReceipt.committedAt === 'string', 'invalid original receipt');
      result(previousReceipt.result);
      await tx.done;
      return { receipt: previousReceipt, replayed: true, stats: budget.snapshot() };
    }
    budget.read();
    const current = await tx.objectStore('heads').get(schema.gameId); head(current, original.expected); budget.received(jsonBytes(current));
    check(sameFence(current, original.expected), 'stale owner or revision'); deadline(original);
    check(current.status === (control === 'resume' ? 'stopped' : 'ready'), 'game is stopped or control already applied');
    const pages = new CanonicalPages(tx, current, budget);
    let state = checkpoint(current.checkpoint);
    const outcome = result(await work({ head: structuredClone(current), pages, setCheckpoint: value => { state = checkpoint(value); } }));
    const staged = await pages.prepare(), revision = current.revision + 1;
    check(integer(revision), 'revision exhausted');
    const receipt: CanonicalReceipt = { generation: schema.generation, gameId: current.gameId, attemptId: original.attemptId,
      fingerprint: signature, beforeRevision: current.revision, afterRevision: revision, committedAt: new Date().toISOString(), result: outcome };
    const controlled = control ? { status: control === 'resume' ? 'ready' as const : 'stopped' as const,
      owner: (original.input as JsonObject).owner as string, epoch: current.epoch + 1 } : {};
    check(!control || integer(current.epoch + 1, 1), 'owner epoch exhausted');
    const next = accountHead(current, { ...current, ...controlled, revision, checkpoint: state, roots: staged.roots },
      appendedBytes(staged.records, staged.nodes, receipt), control === 'stop' || control === 'takeover');
    budget.write(jsonBytes(receipt)); budget.write(jsonBytes(next));
    budget.alive(); deadline(original);
    for (const row of staged.records) await tx.objectStore('records').add(row, [row.gameId, row.id]);
    for (const row of staged.nodes) await tx.objectStore('nodes').add(row, [row.gameId, row.node.id]);
    await tx.objectStore('receipts').add(receipt, [receipt.gameId, receipt.attemptId]);
    await tx.objectStore('heads').put(next, next.gameId);
    budget.alive(); deadline(original);
    await tx.done;
    return { receipt, head: next, replayed: false, stats: budget.snapshot() };
  } catch (error) { abort(); await tx.done.catch(() => {}); budget.alive(); throw error; }
  finally { signal?.removeEventListener('abort', abort); db.close(); }
}

export function canonicalFence(value: CanonicalHead) {
  return { generation: value.generation, gameId: value.gameId, owner: value.owner, epoch: value.epoch, revision: value.revision };
}

/** Application-controlled values only; providers never choose an owner identity. */
export function canonicalOwner(owner = crypto.randomUUID()) { check(validId(owner), 'invalid owner'); return owner; }

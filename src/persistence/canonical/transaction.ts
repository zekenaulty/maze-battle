import { openCanonicalDatabase } from './database';
import { workBudget } from './budget';
import { CanonicalPages, type SnapshotValidator } from './pages';
import { accountHead, appendedBytes } from './accounting';
import { operationAt, prepareOperation } from './operations';
import { operationInput, type OperationAction } from './operationValidation';
import { controlInput, type ControlAction, type ControlIntent } from './controlValidation';
import { validateReceipt } from './receipts';
import { verifyAcknowledgement, type AcknowledgementVerifier } from './acknowledgement';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalOperation, type CanonicalReceipt, type CanonicalRequest, type CanonicalWorkLimits, type Json, type JsonObject } from './types';
import { check, checkpoint, deadline, fingerprint, head, integer, isObject, jsonBytes, marker, request, result, sameFence, validId } from './validation';

export interface CanonicalWork {
  readonly head: CanonicalHead;
  readonly pages: CanonicalPages;
  setCheckpoint(value: JsonObject): void;
  restoreSnapshot(key: string, validate?: SnapshotValidator): Promise<void>;
  liveOperation(id: string): ReturnType<typeof operationAt>;
}

type Options = { limits?: CanonicalWorkLimits; signal?: AbortSignal };

/** Domain callbacks may await only transaction work, never network/timers. */
export function executeCanonical(input: CanonicalRequest, work: (tx: CanonicalWork) => Promise<Json>, options: Options = {}) {
  check(!input.operation.startsWith('control.') && !input.operation.startsWith('operation.'), 'reserved host operation');
  return run(input, work, options);
}

export interface CanonicalOperationWork extends CanonicalWork { operation: CanonicalOperation }
/** Host admission/settlement only. Cancellation/acknowledgement cannot carry world mutations. */
export function operateCanonical(input: CanonicalRequest, action: OperationAction,
  work?: (tx: CanonicalOperationWork) => Promise<Json>, options: Options = {}) {
  const original = request(input), args = operationInput(original, action);
  check(action !== 'acknowledge' || args.proof === undefined, 'verified acknowledgement requires its verifier');
  check(action === 'admit' || action === 'settle' ? typeof work === 'function' : work === undefined, 'invalid operation callback');
  const effect = work ?? (async () => ({ operationId: (original.input as JsonObject).operationId, phase: action }));
  return run(original, tx => {
    check(tx.operation, 'missing operation context');
    return effect({ ...tx, operation: tx.operation });
  }, options, undefined, action);
}

/** Proof is retained once in the request. Only this read-only verifier may release a verified-host reserve. */
export function acknowledgeCanonical(input: CanonicalRequest, verify: AcknowledgementVerifier, options: Options = {}) {
  const original = request(input), args = operationInput(original, 'acknowledge');
  check(isObject(args.proof) && typeof verify === 'function', 'missing acknowledgement verification');
  return run(original, async tx => {
    await verifyAcknowledgement(tx, original, verify);
    return { operationId: args.operationId, phase: 'acknowledge' };
  }, options, undefined, 'acknowledge');
}
/** Exact committed originals only. A missing receipt cannot turn retry into fresh reserve release. */
export function replayAcknowledgement(input: CanonicalRequest, options: Options = {}) {
  return acknowledgeCanonical(input, async () => { throw new Error('Acknowledgement original is not committed; original verification is required.'); }, options);
}

/** Claim stays stopped. Only an explicit { owner, recovery: true } claim may spend global recovery headroom. */
export function controlCanonical(input: CanonicalRequest, action: ControlAction, options: Options = {}) {
  const original = request(input);
  const intent = controlInput(original, action);
  return run(original, async () => ({ status: action === 'resume' ? 'ready' : 'stopped' }), options, intent);
}

async function run(input: CanonicalRequest, work: (tx: CanonicalWork & { operation?: CanonicalOperation }) => Promise<Json>, options: Options, control?: ControlIntent, operation?: OperationAction) {
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
      validateReceipt(previousReceipt, original.expected, original);
      await tx.done;
      return { receipt: previousReceipt, replayed: true, stats: budget.snapshot() };
    }
    budget.read();
    const current = await tx.objectStore('heads').get(schema.gameId); head(current, original.expected); budget.received(jsonBytes(current));
    check(sameFence(current, original.expected), 'stale owner or revision'); deadline(original);
    if (operation !== 'cancel' && operation !== 'acknowledge')
      check(current.status === (control?.action === 'resume' || control?.action === 'claim' ? 'stopped' : 'ready'), 'game is stopped or control already applied');
    const change = operation ? await prepareOperation(tx, current, original, operation, budget) : undefined;
    const pages = new CanonicalPages(tx, current, budget);
    let operationFailed = false, pendingOperations = 0, closed = false;
    const liveOperation = async (id: string) => {
      pendingOperations++;
      try { check(!closed, 'operation view is closed'); return await operationAt(tx, current, id, budget); }
      catch (error) { operationFailed = true; throw error; }
      finally { pendingOperations--; }
    };
    let state = checkpoint(current.checkpoint), checkpointChanged = false;
    const outcome = result(await work({ head: structuredClone(current), pages, operation: change && structuredClone(change.before ?? change.after),
      setCheckpoint: value => { state = checkpoint(value); checkpointChanged = true; },
      restoreSnapshot: (key, validate) => pages.restoreSnapshot(key, validate), liveOperation }));
    if (operation === 'admit' && isObject(outcome) && isObject(outcome.host) && outcome.host.actionResult !== undefined)
      check(change?.after.ackPolicy === 'verified-host', 'host-linked operation requires verified acknowledgement policy');
    closed = true; check(!operationFailed && pendingOperations === 0, 'operation read is not usable');
    const staged = await pages.prepare(), revision = current.revision + 1;
    check(!staged.snapshot || !checkpointChanged && !operation, 'snapshot restore cannot mix checkpoint or operation changes');
    if (staged.snapshot) state = checkpoint(staged.snapshot.checkpoint);
    check(integer(revision), 'revision exhausted');
    const receipt: CanonicalReceipt = { generation: schema.generation, gameId: current.gameId, attemptId: original.attemptId,
      fingerprint: signature, beforeRevision: current.revision, afterRevision: revision, committedAt: new Date().toISOString(), result: outcome };
    const controlled = control ? { status: control.action === 'resume' ? 'ready' as const : 'stopped' as const,
      owner: control.owner, epoch: current.epoch + 1 } : {};
    check(!control || integer(current.epoch + 1, 1), 'owner epoch exhausted');
    const next = accountHead(current, { ...current, ...controlled, revision, checkpoint: state, roots: staged.roots,
      quota: change?.quota ?? current.quota, allocations: change?.allocations ?? current.allocations },
      appendedBytes(staged.records, staged.nodes, receipt) + (change?.chargedBytes ?? 0),
      !!control?.recovery || !!change?.released);
    if (change?.released) check(next.quota.usedBytes - current.quota.usedBytes <= change.released, 'operation exceeds reserved allowance');
    head(next);
    budget.write(jsonBytes(receipt)); budget.write(jsonBytes(next));
    budget.alive(); deadline(original);
    for (const row of staged.records) await tx.objectStore('records').add(row, [row.gameId, row.id]);
    for (const row of staged.nodes) await tx.objectStore('nodes').add(row, [row.gameId, row.node.id]);
    if (change) {
      const table = tx.objectStore('operations'), row = change.after;
      if (change.before) await table.put(row, [row.gameId, row.id]); else await table.add(row, [row.gameId, row.id]);
    }
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

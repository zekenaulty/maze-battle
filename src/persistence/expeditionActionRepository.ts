import type { ExpeditionActionRequest } from '../domain/expedition/protocol';
import { expeditionTransaction, type ExpeditionRecord } from './expeditionDatabase';
import { validateExpeditionRecord } from './expeditionRepository';
import { actionCheck, expeditionActionSignature, naturalRevision, validActionId, validateActionOutcome, validateActionReceipt, validateActionSession } from './expeditionActionValidation';
import { MAX_DURABLE_ACTIONS, type DurableExpeditionReceipt, type DurableExpeditionSession, type ExpeditionActionOutcome, type ExpeditionActionReservation, type ExpeditionOwner } from './expeditionActionTypes';
export type { DurableExpeditionReceipt, DurableExpeditionSession, ExpeditionActionEffect, ExpeditionActionOutcome, ExpeditionActionReservation, ExpeditionOwner } from './expeditionActionTypes';

type Transaction = Parameters<Parameters<typeof expeditionTransaction>[1]>[0];

async function recordFor(tx: Transaction, slotId: string): Promise<ExpeditionRecord> {
  const [record] = await tx.objectStore('expeditions').getAll(slotId, 1);
  validateExpeditionRecord(record);
  return record;
}

async function sessionFor(tx: Transaction, slotId: string, record: ExpeditionRecord) {
  const rows = await tx.objectStore('actionSessions').getAll(slotId, 1);
  if (!rows.length) return undefined;
  validateActionSession(rows[0], record);
  return rows[0];
}

async function receiptFor(tx: Transaction, slotId: string, request: ExpeditionActionRequest | string, record: ExpeditionRecord) {
  const actionId = typeof request === 'string' ? request : request.actionId;
  const rows = await tx.objectStore('actionReceipts').getAll([slotId, actionId], 1);
  if (!rows.length) return undefined;
  validateActionReceipt(rows[0], record.plan);
  actionCheck(rows[0].request.actionId === actionId, 'receipt key mismatch');
  if (typeof request !== 'string') actionCheck(rows[0].signature === expeditionActionSignature(request), 'action ID reused with different input');
  return rows[0];
}

function checkOwner(session: DurableExpeditionSession | undefined, owner: ExpeditionOwner): asserts session is DurableExpeditionSession {
  actionCheck(session && owner && session.sessionId === owner.sessionId && session.epoch === owner.epoch, 'control ownership changed');
}

export async function loadExpeditionSession(slotId: string): Promise<DurableExpeditionSession | undefined> {
  actionCheck(validActionId(slotId), 'invalid slot ID');
  return expeditionTransaction('readonly', async tx => sessionFor(tx, slotId, await recordFor(tx, slotId)));
}

/** null creates only; otherwise CAS the current epoch and increment it. Reload queries
 * reconcile a lost takeover acknowledgement. No takeover clears pending work or budget.
 * Tokens fence local writers; they are not authentication credentials.
 */
export async function claimExpeditionSession(slotId: string, sessionId: string, expectedEpoch: number | null, maxActions?: number): Promise<DurableExpeditionSession> {
  actionCheck(validActionId(slotId) && validActionId(sessionId) && (expectedEpoch === null || naturalRevision(expectedEpoch)), 'invalid session claim');
  actionCheck(maxActions === undefined || (naturalRevision(maxActions) && maxActions > 0 && maxActions <= MAX_DURABLE_ACTIONS), 'invalid action budget');
  return expeditionTransaction('readwrite', async tx => {
    const record = await recordFor(tx, slotId);
    const current = await sessionFor(tx, slotId, record);
    actionCheck(current ? current.epoch === expectedEpoch : expectedEpoch === null, 'epoch conflict');
    actionCheck(!current || maxActions === undefined || maxActions === current.maxActions, 'action budget is immutable');
    const session: DurableExpeditionSession = {
      version: 1, worldId: record.plan.recipe.worldId, floorId: record.plan.recipe.floorId, scopeId: record.plan.scopeId,
      sessionId, epoch: current ? current.epoch + 1 : 0, maxActions: current?.maxActions ?? maxActions ?? MAX_DURABLE_ACTIONS,
      receiptCount: current?.receiptCount ?? 0, pendingActionId: current?.pendingActionId ?? null,
    };
    validateActionSession(session, record);
    await tx.objectStore('actionSessions').put(session, slotId);
    return session;
  });
}

/** Never executes. A full request checks replay identity; ID-only lookup recovers the
 * saved request from session.pendingActionId after reload. Neither form authenticates
 * a remote caller: an eventual transport must enforce its own access boundary.
 */
export async function loadExpeditionAction(slotId: string, request: ExpeditionActionRequest | string): Promise<DurableExpeditionReceipt | undefined> {
  actionCheck(validActionId(slotId), 'invalid slot ID');
  const input = structuredClone(request);
  if (typeof input === 'string') actionCheck(validActionId(input), 'invalid action ID');
  else expeditionActionSignature(input);
  return expeditionTransaction('readonly', async tx => receiptFor(tx, slotId, input, await recordFor(tx, slotId)));
}

/** Reserve before any work. Only `reserved` permits computing a new local transition.
 * `existing` is reconciliation, including unresolved reservations after a crash.
 * Receipts are never evicted. Exhaustion fails closed; takeover cannot refill budget.
 */
export async function beginExpeditionAction(slotId: string, request: ExpeditionActionRequest): Promise<ExpeditionActionReservation> {
  actionCheck(validActionId(slotId), 'invalid slot ID');
  const input = structuredClone(request);
  const signature = expeditionActionSignature(input);
  return expeditionTransaction('readwrite', async tx => {
    const record = await recordFor(tx, slotId);
    const previous = await receiptFor(tx, slotId, input, record);
    if (previous) return { status: 'existing', receipt: previous };
    const session = await sessionFor(tx, slotId, record);
    checkOwner(session, input);
    actionCheck(record.checkpoint.revision === input.expectedRevision, 'checkpoint revision conflict');
    actionCheck(session.pendingActionId === null, 'an unresolved action requires reconciliation');
    actionCheck(session.receiptCount < session.maxActions, 'action ledger exhausted');
    const receipt: DurableExpeditionReceipt = {
      version: 1, request: input, signature,
      result: { actionId: input.actionId, disposition: 'unresolved', beforeRevision: input.expectedRevision,
        afterRevision: input.expectedRevision, reason: 'Action reserved; reconcile before retrying.' },
    };
    await tx.objectStore('actionReceipts').add(receipt, [slotId, input.actionId]);
    await tx.objectStore('actionSessions').put({ ...session, receiptCount: session.receiptCount + 1, pendingActionId: input.actionId }, slotId);
    return { status: 'reserved', receipt, plan: record.plan, checkpoint: record.checkpoint };
  });
}

/** Atomically settle a local checkpoint effect and its original result. The caller
 * must not publish the tentative checkpoint before this resolves. On storage failure,
 * query the original request; absence of a settled receipt is NOT permission to retry
 * an external effect. A new owner can explicitly reconcile a prior reservation by
 * supplying its current token; default ownership is the request's original token.
 * Exact settled duplicates return the original receipt, ignoring recomputed outcomes.
 */
export async function settleExpeditionAction(slotId: string, request: ExpeditionActionRequest, outcome: ExpeditionActionOutcome, owner: ExpeditionOwner = request): Promise<DurableExpeditionReceipt> {
  actionCheck(validActionId(slotId), 'invalid slot ID');
  const input = structuredClone(request);
  expeditionActionSignature(input);
  const proposed = structuredClone(outcome);
  const token = structuredClone({ sessionId: owner.sessionId, epoch: owner.epoch });
  return expeditionTransaction('readwrite', async tx => {
    const record = await recordFor(tx, slotId);
    const receipt = await receiptFor(tx, slotId, input, record);
    actionCheck(receipt, 'action was not reserved');
    if (receipt.result.disposition !== 'unresolved') return receipt;
    const session = await sessionFor(tx, slotId, record);
    checkOwner(session, token);
    actionCheck(session.pendingActionId === input.actionId && record.checkpoint.revision === input.expectedRevision, 'checkpoint revision or pending action conflict');
    const effect = validateActionOutcome(record, input, proposed);
    const settled: DurableExpeditionReceipt = { ...receipt, result: proposed.result, ...(effect ? { effect } : {}) };
    if (effect) await tx.objectStore('expeditions').put({ ...record, checkpoint: proposed.checkpoint }, slotId);
    await tx.objectStore('actionReceipts').put(settled, [slotId, input.actionId]);
    await tx.objectStore('actionSessions').put({ ...session, pendingActionId: null }, slotId);
    return settled;
  });
}

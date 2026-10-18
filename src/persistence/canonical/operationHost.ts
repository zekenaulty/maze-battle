import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import type { GameCheckpoint } from './game/checkpoint';
import type { KnowledgeRead } from './knowledge/types';
import type { CanonicalPages } from './pages';
import { fields } from './roster/codec';
import type { CanonicalWork } from './transaction';
import type { CanonicalHead, CanonicalOperation, CanonicalRecord, CanonicalRequest, GameIdentity, Json } from './types';
import { check, isObject, jsonBytes, record, recordKey, request as validateRequest, result as validateResult, validId } from './validation';
import { json, same } from './world/records';

export interface OperationReceiptRef extends GameIdentity { attemptId: string }
export interface OperationRecordRef { key: string; recordId: string; revision: number; sourceAttemptId: string; recordWitness: string }
export interface OperationHostRefs { actionResult?: OperationRecordRef; event?: OperationRecordRef }
export interface OperationPreparation {
  readonly head: CanonicalHead;
  readonly request: CanonicalRequest;
  /** Prepared admission, or the validated admitted operation before step/settlement. */
  readonly operation: CanonicalOperation;
  readonly receiptRef: OperationReceiptRef;
  readonly knowledge: KnowledgeRead;
  getExecution(key: string): ReturnType<CanonicalPages['get']>;
  sourceReceipt: CanonicalPages['sourceReceipt'];
  readonly savedSnapshot: CanonicalPages['savedSnapshot'];
  liveOperation: CanonicalWork['liveOperation'];
}
export interface OperationCommit<P> extends OperationPreparation {
  readonly progress: P;
  /** Post-operation checkpoint with committed domain evidence, not a wire revision. */
  readonly checkpoint: GameCheckpoint;
  appendExecution(key: string, value: Json): Promise<OperationRecordRef>;
}
/** Trusted host only. Await transaction reads/writes, never network/timers. */
export interface OperationHostHooks<P> {
  prepare(view: OperationPreparation): Promise<void>;
  commit(view: OperationCommit<P>): Promise<OperationHostRefs>;
}
export interface OperationCommitData<P> { progress: P; checkpoint: GameCheckpoint; result: Json }
export const operationReceiptRef = (source: GameIdentity & { attemptId: string }): OperationReceiptRef => ({
  generation: source.generation, gameId: source.gameId, attemptId: source.attemptId,
});
/** Exact immutable record body, including its canonical identity; bounded inside the kernel result limit. */
export function operationRecordRef(row: CanonicalRecord, sourceAttemptId: string, label = 'operation'): OperationRecordRef {
  record(row, row.id, row, 'execution', `record/${row.key}`); check(validId(sourceAttemptId), `invalid ${label} source attempt`);
  const ref = { key: row.key, recordId: row.id, revision: row.revision, sourceAttemptId, recordWitness: canonicalJson(row) };
  jsonBytes(ref, 12 * 1024); return ref;
}

/** The domain executor opens the reservation-validated transaction. */
export async function prepareOperationHost<P>(tx: CanonicalWork, operation: CanonicalOperation, request: CanonicalRequest,
  hooks?: OperationHostHooks<P>, label = 'operation') {
  if (!hooks) return async (data: OperationCommitData<P>) => data.result;
  check(typeof hooks.prepare === 'function' && typeof hooks.commit === 'function', `invalid ${label} host hooks`);
  const { prepare, commit } = hooks;
  jsonBytes(operation); operation = structuredClone(operation); request = validateRequest(request);
  jsonBytes(tx.head); const head = structuredClone(tx.head);
  let phase: 'prepare' | 'work' | 'commit' | 'closed' = 'prepare', pending = 0, failed = false;
  const appended = new Map<string, OperationRecordRef>();
  const access = async <T>(work: () => Promise<T>): Promise<T> => {
    pending++;
    try { check(phase === 'prepare' || phase === 'commit', `${label} host view is closed`); return await work(); }
    catch (error) { failed = true; throw error; }
    finally { pending--; }
  };
  const knowledge = (area: string) => check(area === 'knowledge', `${label} host cannot read hidden world`);
  const metadata = () => structuredClone({ head, request, operation,
    receiptRef: operationReceiptRef({ ...request.expected, attemptId: request.attemptId }) });
  const readers = {
    getExecution: (key: string) => access(() => tx.pages.get('execution', key)),
    sourceReceipt: (id: string) => access(() => tx.pages.sourceReceipt(id)),
    savedSnapshot: (key: string) => access(() => tx.pages.savedSnapshot(key)),
    liveOperation: (id: string) => access(() => tx.liveOperation(id)),
    knowledge: {
      get: (area, key) => access(() => { knowledge(area); return tx.pages.get('knowledge', key); }),
      scan: (area, prefix, after, limit) => access(() => { knowledge(area); return tx.pages.scan('knowledge', prefix, after, limit); }),
      witness: (area, prefix) => access(() => { knowledge(area); return tx.pages.witness('knowledge', prefix); }),
    } satisfies KnowledgeRead,
  };
  await prepare({ ...metadata(), ...readers });
  phase = 'work'; check(!failed && pending === 0, `${label} host work is not usable`);
  return async (data: OperationCommitData<P>): Promise<Json> => {
    check(phase === 'work' && !failed && pending === 0, `${label} host work is not usable`); phase = 'commit';
    jsonBytes(data); data = structuredClone(data);
    const appendExecution = (key: string, value: Json) => access(async () => {
      recordKey(key); check(!key.startsWith('navigation/') && !key.startsWith('interaction/') && appended.size < 8, `invalid ${label} host record`);
      jsonBytes(value); value = structuredClone(value);
      check(!await tx.pages.get('execution', key), `${label} host record already exists`);
      const row = await tx.pages.set('execution', key, value);
      const ref = operationRecordRef(row, request.attemptId, label);
      appended.set(row.id, ref); return structuredClone(ref);
    });
    const refs = await commit({ ...metadata(), ...readers, appendExecution,
      progress: structuredClone(data.progress), checkpoint: structuredClone(data.checkpoint) });
    phase = 'closed'; check(!failed && pending === 0, `${label} host work is not usable`);
    const exact = fields(refs, '', 'actionResult event');
    for (const ref of Object.values(exact)) check(isObject(ref) && typeof ref.recordId === 'string'
      && same(ref, appended.get(ref.recordId) ?? null), `${label} host reference is not from this commit`);
    check(isObject(data.result), `invalid ${label} result`);
    return validateResult(json({ ...data.result, host: exact }));
  };
}

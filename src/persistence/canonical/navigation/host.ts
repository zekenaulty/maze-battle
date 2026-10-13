import type { GameCheckpoint } from '../game/checkpoint';
import type { KnowledgeRead } from '../knowledge/types';
import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalOperation, CanonicalRequest, GameIdentity, Json } from '../types';
import { check, isObject, recordKey } from '../validation';
import { json, same } from '../world/records';
import type { DestinationProgress } from './types';

export interface NavigationReceiptRef extends GameIdentity { attemptId: string }
export interface NavigationRecordRef { key: string; recordId: string; revision: number; sourceAttemptId: string }
export interface NavigationHostRefs { actionResult?: NavigationRecordRef; event?: NavigationRecordRef }
export interface NavigationPreparation {
  readonly head: CanonicalHead;
  readonly request: CanonicalRequest;
  /** Prepared admission, or the validated admitted operation before step/settlement. */
  readonly operation: CanonicalOperation;
  readonly receiptRef: NavigationReceiptRef;
  readonly knowledge: KnowledgeRead;
  getExecution(key: string): ReturnType<CanonicalPages['get']>;
  sourceReceipt: CanonicalPages['sourceReceipt'];
  liveOperation: CanonicalWork['liveOperation'];
}
export interface NavigationCommit extends NavigationPreparation {
  readonly progress: DestinationProgress;
  /** Post-movement checkpoint with the newly earned observation, not a wire revision. */
  readonly checkpoint: GameCheckpoint;
  appendExecution(key: string, value: Json): Promise<NavigationRecordRef>;
}
/** Trusted host only. Await transaction reads/writes, never network/timers. */
export interface NavigationHostHooks {
  prepare(view: NavigationPreparation): Promise<void>;
  commit(view: NavigationCommit): Promise<NavigationHostRefs>;
}
export interface NavigationCommitData { progress: DestinationProgress; checkpoint: GameCheckpoint; result: Json }
export const navigationReceiptRef = (source: GameIdentity & { attemptId: string }): NavigationReceiptRef => ({
  generation: source.generation, gameId: source.gameId, attemptId: source.attemptId,
});

/** Only executeNavigationCommand opens the reservation-validated transaction. */
export async function prepareNavigationHost(tx: CanonicalWork, operation: CanonicalOperation, request: CanonicalRequest, hooks?: NavigationHostHooks) {
  if (!hooks) return async (data: NavigationCommitData) => data.result;
  check(typeof hooks.prepare === 'function' && typeof hooks.commit === 'function', 'invalid navigation host hooks');
  const { prepare, commit } = hooks;
  let phase: 'prepare' | 'work' | 'commit' | 'closed' = 'prepare', pending = 0, failed = false;
  const appended = new Map<string, NavigationRecordRef>();
  const access = async <T>(work: () => Promise<T>): Promise<T> => {
    pending++;
    try { check(phase === 'prepare' || phase === 'commit', 'navigation host view is closed'); return await work(); }
    catch (error) { failed = true; throw error; }
    finally { pending--; }
  };
  const knowledge = (area: string) => check(area === 'knowledge', 'navigation host cannot read hidden world');
  const metadata = () => structuredClone({ head: tx.head, request, operation,
    receiptRef: navigationReceiptRef({ ...request.expected, attemptId: request.attemptId }) });
  const readers = {
    getExecution: (key: string) => access(() => tx.pages.get('execution', key)),
    sourceReceipt: (id: string) => access(() => tx.pages.sourceReceipt(id)),
    liveOperation: (id: string) => access(() => tx.liveOperation(id)),
    knowledge: {
      get: (area, key) => access(() => { knowledge(area); return tx.pages.get('knowledge', key); }),
      scan: (area, prefix, after, limit) => access(() => { knowledge(area); return tx.pages.scan('knowledge', prefix, after, limit); }),
      witness: (area, prefix) => access(() => { knowledge(area); return tx.pages.witness('knowledge', prefix); }),
    } satisfies KnowledgeRead,
  };
  await prepare({ ...metadata(), ...readers });
  phase = 'work'; check(!failed && pending === 0, 'navigation host work is not usable');
  return async (data: NavigationCommitData): Promise<Json> => {
    check(phase === 'work' && !failed && pending === 0, 'navigation host work is not usable'); phase = 'commit';
    const appendExecution = (key: string, value: Json) => access(async () => {
      recordKey(key); check(!key.startsWith('navigation/') && appended.size < 8, 'invalid navigation host record');
      check(!await tx.pages.get('execution', key), 'navigation host record already exists');
      const row = await tx.pages.set('execution', key, value);
      const ref = { key, recordId: row.id, revision: row.revision, sourceAttemptId: request.attemptId };
      appended.set(row.id, ref); return structuredClone(ref);
    });
    const refs = await commit({ ...metadata(), ...readers, appendExecution,
      progress: structuredClone(data.progress), checkpoint: structuredClone(data.checkpoint) });
    phase = 'closed'; check(!failed && pending === 0, 'navigation host work is not usable');
    const exact = fields(refs, '', 'actionResult event');
    for (const ref of Object.values(exact)) check(isObject(ref) && typeof ref.recordId === 'string'
      && same(ref, appended.get(ref.recordId) ?? null), 'navigation host reference is not from this commit');
    check(isObject(data.result), 'invalid navigation result');
    return json({ ...data.result, host: exact });
  };
}

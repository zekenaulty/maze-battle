import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import type { KnowledgeAnchor } from '../knowledge/types';
import type { CanonicalQuery } from '../read';
import type { CanonicalGameSnapshot, CanonicalRequest, JsonObject } from '../types';
import type { QuestQueryProof } from './quest.proof';

export const MAX_ACTION_BYTES = 4096;
export const MAX_RESULT_BYTES = 4096;
export const MAX_SOURCE_REQUEST_BYTES = 2048;
export const MAX_PROOF_BYTES = 12 * 1024;
export type ProtocolRead = Pick<CanonicalQuery, 'get' | 'savedSnapshot' | 'sourceReceipt'>;
export interface ProtocolRef { key: string; id: string }
/** Merge receipt verbatim into the caller's outcome; only one new source anchor per transaction. */
export interface ProtocolWrite { reference: ProtocolRef; receipt: JsonObject }
export interface ProtocolSource {
  schema: 1; kind: 'agentica-publication' | 'agentica-action' | 'agentica-result';
  sourceAttemptId: string; sourceRequest: CanonicalRequest;
  owner: string; epoch: number;
}
export interface Publication extends ProtocolSource {
  kind: 'agentica-publication'; wireRevision: number;
  snapshot: CanonicalGameSnapshot; observation: KnowledgeAnchor | null;
}
/** Prepared before opening IndexedDB; hashing is never awaited inside a transaction. */
export interface PreparedAction {
  readonly key: string; readonly fingerprint: string; readonly storageKey: string;
  readonly action: Readonly<AgenticaAction>;
}
export interface PendingAction extends ProtocolSource {
  kind: 'agentica-action'; key: string; fingerprint: string; action: AgenticaAction;
  publication: ProtocolRef; effect: 'readOnly' | 'writesLocalState';
}
export interface ActionResult extends ProtocolSource {
  kind: 'agentica-result'; proof: 'standalone' | 'navigation' | 'interaction'; original: ProtocolRef; result: AgenticaResult;
  query?: QuestQueryProof;
}
export interface RetainedAction {
  reference: ProtocolRef; original: PendingAction; publication: Publication;
  result: AgenticaResult | null; resultReference: ProtocolRef | null;
}

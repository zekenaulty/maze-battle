import { actionFingerprint, actionKey, canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction } from '../../../services/agentica/contracts';
import { fields } from '../roster/codec';
import { check, integer, jsonBytes, recordKey, request as validateRequest, sameFence, validId } from '../validation';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, CanonicalRecord, JsonObject } from '../types';
import { gameCheckpoint } from '../game/checkpoint';
import { MAX_ACTION_BYTES, MAX_PROOF_BYTES, MAX_SOURCE_REQUEST_BYTES } from './types';
import type { PreparedAction, ProtocolRead, ProtocolRef, ProtocolSource, ProtocolWrite } from './types';

export const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export function wireId(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/.test(value), 'invalid Agentica wire identity');
}
export function validateAction(value: unknown): AgenticaAction {
  jsonBytes(value, MAX_ACTION_BYTES);
  const row = fields(value, 'actionId runId runnerRunId stepId sessionId sessionEpoch capabilityId manifestHash arguments expectedRevision deadlineAt');
  for (const key of ['actionId', 'runId', 'runnerRunId', 'stepId', 'sessionId', 'sessionEpoch', 'capabilityId']) wireId(row[key]);
  check(typeof row.manifestHash === 'string' && /^sha256:[0-9a-f]{64}$/.test(row.manifestHash), 'invalid Agentica manifest');
  check(integer(row.expectedRevision) && typeof row.deadlineAt === 'string' && Number.isFinite(Date.parse(row.deadlineAt)), 'invalid Agentica revision or deadline');
  check(row.arguments !== null && typeof row.arguments === 'object' && !Array.isArray(row.arguments), 'invalid Agentica arguments');
  return structuredClone(value) as AgenticaAction;
}
const prepared = new WeakMap<PreparedAction, string>();
export async function prepareAction(value: AgenticaAction): Promise<PreparedAction> {
  const action = validateAction(value), key = actionKey(action), fingerprint = actionFingerprint(action);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const storageKey = `agentica/actions/${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
  const identity = Object.freeze({ key, fingerprint, storageKey, action });
  prepared.set(identity, canonicalJson(identity)); return identity;
}
export function validatePrepared(value: PreparedAction) {
  check(prepared.has(value) && prepared.get(value) === canonicalJson(value), 'prepare the exact original action before the transaction');
}
export function reference(value: unknown): asserts value is ProtocolRef {
  jsonBytes(value, 1024); const ref = fields(value, 'key id'); recordKey(ref.key as string);
  check(validId(ref.id) && (ref.key as string).startsWith('agentica/'), 'invalid Agentica record reference');
}
export function source(tx: CanonicalWork, input: CanonicalRequest, kind: ProtocolSource['kind']): ProtocolSource {
  jsonBytes(input, MAX_SOURCE_REQUEST_BYTES); const request = validateRequest(input);
  check(tx.head.status === 'ready' && sameFence(request.expected, canonicalFence(tx.head)), 'Agentica writer custody changed');
  gameCheckpoint(tx.head.checkpoint);
  const { generation, gameId, revision, roots, checkpoint, owner, epoch } = tx.head;
  return { schema: 1, kind, sourceAttemptId: request.attemptId, sourceRequest: request, owner, epoch,
    snapshot: structuredClone({ generation, gameId, revision, roots: { world: roots.world, knowledge: roots.knowledge }, checkpoint }) };
}
export async function readSource(pages: ProtocolRead, ref: ProtocolRef, kind: ProtocolSource['kind'], extra: string) {
  reference(ref);
  const { record, snapshot, source: original } = await pages.savedSnapshot(ref.key);
  const row = fields(record.value, `schema kind sourceAttemptId sourceRequest snapshot owner epoch ${extra}`);
  check(record.id === ref.id && record.key === ref.key && record.indexes.length === 0 && row.schema === 1 && row.kind === kind, 'Agentica source reference changed');
  jsonBytes(row.sourceRequest, MAX_SOURCE_REQUEST_BYTES); validateRequest(row.sourceRequest as unknown as CanonicalRequest);
  check(equal(row.sourceRequest, original) && row.sourceAttemptId === original.attemptId && equal(row.snapshot, snapshot)
    && row.owner === original.expected.owner && row.epoch === original.expected.epoch, 'Agentica source custody changed');
  gameCheckpoint(snapshot.checkpoint);
  return structuredClone(row) as unknown as ProtocolSource;
}
export async function writeSource(tx: CanonicalWork, key: string, value: ProtocolSource): Promise<ProtocolWrite> {
  check(!await tx.pages.get('execution', key), 'Agentica source is immutable');
  const record = await tx.pages.set('execution', key, value as unknown as JsonObject);
  return proof(record);
}
function proof(row: CanonicalRecord): ProtocolWrite {
  const ref = { key: row.key, id: row.id };
  // Caller must include these exact fields in its receipt. The kernel anchors the entire record.
  const receipt = { snapshotRecordId: row.id, snapshotWitness: canonicalJson(row), reference: ref };
  jsonBytes(receipt, MAX_PROOF_BYTES); return { reference: ref, receipt };
}

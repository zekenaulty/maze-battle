import { actionFingerprint, actionKey, canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction } from '../../../services/agentica/contracts';
import { fields } from '../roster/codec';
import { check, integer, jsonBytes, recordKey, validId } from '../validation';
import { MAX_ACTION_BYTES } from './types';
import type { PendingAction, PreparedAction, ProtocolRead, ProtocolRef } from './types';
import { readSource } from './validation.source';

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
export interface ActionLookup { readonly key: string; readonly storageKey: string }
const lookups = new WeakSet<ActionLookup>();
export async function prepareActionLookup(key: string): Promise<ActionLookup> {
  check(typeof key === 'string' && key.length <= 2048, 'invalid action key');
  const parts: unknown = JSON.parse(key);
  check(Array.isArray(parts) && parts.length === 4, 'invalid action key');
  for (const part of parts) wireId(part);
  check(canonicalJson(parts) === key, 'noncanonical action key');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const storageKey = `agentica/actions/${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
  const lookup = Object.freeze({ key, storageKey }); lookups.add(lookup); return lookup;
}
export function validateActionLookup(lookup: ActionLookup) {
  check(lookups.has(lookup), 'prepare the action lookup before the transaction');
}
/** The digest is prepared before IndexedDB; original input and source proof are still verified on read. */
export function prepareLookedUpAction(lookup: ActionLookup, value: AgenticaAction): PreparedAction {
  validateActionLookup(lookup);
  const action = validateAction(value), key = actionKey(action), fingerprint = actionFingerprint(action);
  check(key === lookup.key, 'action lookup identity changed');
  const identity = Object.freeze({ key, fingerprint, storageKey: lookup.storageKey, action });
  prepared.set(identity, canonicalJson(identity)); return identity;
}
export async function prepareAction(value: AgenticaAction): Promise<PreparedAction> {
  const action = validateAction(value);
  return prepareLookedUpAction(await prepareActionLookup(actionKey(action)), action);
}
/** Internal historical read: inherit the committed storage-key proof without asynchronous hashing in IDB. */
export async function restoreRetainedAction(pages: ProtocolRead, input: ProtocolRef,
  binding: { grant: ProtocolRef; publication: ProtocolRef }): Promise<PreparedAction> {
  const ref = snapshotReference(input), grant = snapshotReference(binding.grant), publication = snapshotReference(binding.publication);
  check(/^agentica\/actions\/[a-f0-9]{64}$/.test(ref.key), 'invalid retained action identity');
  const pending = await readSource(pages, ref, 'agentica-action', 'key fingerprint action publication effect') as PendingAction;
  const action = validateAction(pending.action), key = actionKey(action), fingerprint = actionFingerprint(action);
  const args = fields(pending.sourceRequest.input, 'action grant publication');
  check(pending.sourceRequest.operation === 'agentica.action.reserve' && args.action === ref.key
    && pending.key === key && pending.fingerprint === fingerprint && equal(args.grant, grant)
    && equal(args.publication, publication) && equal(pending.publication, publication), 'retained action identity changed');
  const identity = Object.freeze({ key, fingerprint, storageKey: ref.key, action });
  prepared.set(identity, canonicalJson(identity)); return identity;
}
export function validatePrepared(value: PreparedAction) {
  check(prepared.has(value), 'prepare the exact original action before the transaction');
  jsonBytes(value, 4 * MAX_ACTION_BYTES);
  check(prepared.get(value) === canonicalJson(value), 'prepare the exact original action before the transaction');
}
/** Own the validated wire input before yielding; readonly does not protect nested arguments. */
export function snapshotPrepared(value: PreparedAction): PreparedAction {
  validatePrepared(value);
  const copy = structuredClone(value); prepared.set(copy, prepared.get(value)!); return copy;
}
export function snapshotJson<T>(value: T, max?: number): T {
  jsonBytes(value, max); return structuredClone(value);
}
export function reference(value: unknown): asserts value is ProtocolRef {
  jsonBytes(value, 1024); const ref = fields(value, 'key id'); recordKey(ref.key as string);
  check(validId(ref.id) && (ref.key as string).startsWith('agentica/'), 'invalid Agentica record reference');
}
export function snapshotReference(value: ProtocolRef): ProtocolRef {
  reference(value); return structuredClone(value);
}

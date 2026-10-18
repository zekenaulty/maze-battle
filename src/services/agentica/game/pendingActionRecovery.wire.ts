import { fields } from '../../../persistence/canonical/roster/codec';
import { check } from '../../../persistence/canonical/validation';
import { snapshotJson, wireId } from '../../../persistence/canonical/agentica/validation';
import { pendingRecoveryUrl } from './pendingRecovery.wire';
import type { PendingActionDescriptor, PendingActionPage, PendingRecoveryRun } from './pendingActionRecovery.types';

export const PENDING_ACTION_PAGE_SIZE = 16;
export const pendingClearance = { rootClear: 'unknown', sessionClear: 'unknown' } as const;
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

export function pendingDescriptor(input: unknown): PendingActionDescriptor {
  const row = fields(snapshotJson(input, 1024), 'actionId requestHash capabilityHash disposition recoveryRetention');
  wireId(row.actionId);
  check(digest(row.requestHash) && digest(row.capabilityHash), 'invalid pending action hashes');
  if (row.disposition !== null) wireId(row.disposition);
  if (row.recoveryRetention !== null) wireId(row.recoveryRetention);
  return row as unknown as PendingActionDescriptor;
}
export function pendingRunUrl(endpoint: string, run: PendingRecoveryRun, after: string | null) {
  if (after !== null) wireId(after);
  const url = new URL(pendingRecoveryUrl(endpoint)); url.pathname = '/api/recovery/run';
  for (const [key, value] of Object.entries(run)) url.searchParams.set(key, value);
  if (after !== null) url.searchParams.set('afterActionId', after);
  return url.href;
}
export function pendingPage(input: unknown, run: PendingRecoveryRun, after: string | null): PendingActionPage {
  const row = fields(snapshotJson(input, 32 * 1024), 'hostId sessionId sessionEpoch runId items nextAfterActionId');
  check(Object.entries(run).every(([key, value]) => row[key] === value), 'pending recovery run changed');
  check(Array.isArray(row.items) && row.items.length <= PENDING_ACTION_PAGE_SIZE, 'invalid pending recovery page size');
  const items = row.items.map(pendingDescriptor);
  let previous = after;
  for (const item of items) {
    check(previous === null || item.actionId > previous, 'pending recovery keyset is not strictly ordered');
    previous = item.actionId;
  }
  const next = row.nextAfterActionId;
  if (next !== null) {
    wireId(next);
    check(items.length === PENDING_ACTION_PAGE_SIZE && next === previous, 'invalid pending recovery next cursor');
  }
  return { ...run, items, nextAfterActionId: next as string | null, ...pendingClearance };
}
export function selectedHashes(input: unknown, descriptor: PendingActionDescriptor) {
  check(input !== null && typeof input === 'object' && !Array.isArray(input), 'invalid exact recovery entry');
  const row = input as Record<string, unknown>;
  check(row.requestHash === descriptor.requestHash && row.capabilityHash === descriptor.capabilityHash,
    'selected recovery hashes changed');
}

import type { CanonicalReceipt, CanonicalRequest, GameIdentity } from './types';
import { check, fingerprint, identity, integer, jsonBytes, request, result, validId } from './validation';

/** Same validation for retry reconciliation and every retained source dependency. */
export function validateReceipt(value: CanonicalReceipt | undefined, scope: GameIdentity, expected?: CanonicalRequest) {
  check(value, 'missing source receipt'); jsonBytes(value); identity(value, scope);
  check(Object.keys(value).sort().join(',') === 'afterRevision,attemptId,beforeRevision,committedAt,fingerprint,gameId,generation,result'
    && validId(value.attemptId) && integer(value.beforeRevision) && integer(value.afterRevision)
    && value.afterRevision === value.beforeRevision + 1 && typeof value.fingerprint === 'string'
    && typeof value.committedAt === 'string' && Number.isFinite(Date.parse(value.committedAt))
    && new Date(value.committedAt).toISOString() === value.committedAt, 'invalid original receipt');
  const original = request(JSON.parse(value.fingerprint) as CanonicalRequest); identity(original.expected, scope);
  check(value.attemptId === original.attemptId && value.beforeRevision === original.expected.revision
    && value.fingerprint === fingerprint(original) && (!expected || value.fingerprint === fingerprint(expected)), 'invalid original receipt');
  result(value.result);
  return original;
}

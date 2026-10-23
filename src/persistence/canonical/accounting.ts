import type { CanonicalHead, CanonicalIndexNode, CanonicalReceipt, CanonicalRecord } from './types';
import { check, jsonBytes } from './validation';
import { privateAdmissionBytes, validatePrivateCapacity } from './privateCapacity';

/** Logical JSON charge including store/key. Never presented as physical disk bytes. */
export function storedBytes(store: string, key: unknown, value: unknown) {
  return jsonBytes([store, key, value], 128 * 1024);
}
export function assertPrivateAdmission(value: CanonicalHead, recovery = false) {
  const q = value.quota;
  validatePrivateCapacity(q.privateCapacity);
  const charged = privateAdmissionBytes(q.privateCapacity, q.usedBytes, storedBytes('heads', value.gameId, value));
  check(Number.isSafeInteger(charged + q.reservedBytes)
    && charged + q.reservedBytes <= q.limitBytes - (recovery ? 0 : q.reserveBytes), 'storage quota exhausted');
}

export function accountHead(previous: CanonicalHead | undefined, next: CanonicalHead, addedBytes: number,
  recovery = false, admission: 'private' | 'cleanup' = 'private') {
  check(admission === 'private' || admission === 'cleanup' && recovery, 'invalid capacity admission');
  const base = (previous?.quota.usedBytes ?? 0) - (previous ? storedBytes('heads', previous.gameId, previous) : 0) + addedBytes;
  const out = structuredClone(next);
  for (let i = 0; i < 16; i++) {
    const bytes = base + storedBytes('heads', out.gameId, out);
    if (bytes === out.quota.usedBytes) break;
    out.quota.usedBytes = bytes;
  }
  check(Number.isSafeInteger(out.quota.usedBytes) && out.quota.usedBytes >= 0
    && out.quota.usedBytes === base + storedBytes('heads', out.gameId, out), 'invalid byte accounting');
  check(Number.isSafeInteger(out.quota.reservedBytes) && out.quota.reservedBytes >= 0, 'invalid reserved byte accounting');
  if (admission === 'private') assertPrivateAdmission(out, recovery);
  else check(Number.isSafeInteger(out.quota.usedBytes + out.quota.reservedBytes)
    && out.quota.usedBytes + out.quota.reservedBytes <= out.quota.limitBytes, 'storage quota exhausted');
  return out;
}
export function appendedBytes(records: CanonicalRecord[], nodes: CanonicalIndexNode[], receipt?: CanonicalReceipt) {
  return records.reduce((sum, r) => sum + storedBytes('records', [r.gameId, r.id], r), 0)
    + nodes.reduce((sum, r) => sum + storedBytes('nodes', [r.gameId, r.node.id], r), 0)
    + (receipt ? storedBytes('receipts', [receipt.gameId, receipt.attemptId], receipt) : 0);
}

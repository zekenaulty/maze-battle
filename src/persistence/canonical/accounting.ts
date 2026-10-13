import type { CanonicalHead, CanonicalIndexNode, CanonicalReceipt, CanonicalRecord } from './types';
import { check, jsonBytes } from './validation';

/** Logical JSON charge including store/key. Never presented as physical disk bytes. */
export function storedBytes(store: string, key: unknown, value: unknown) {
  return jsonBytes([store, key, value], 128 * 1024);
}
export function accountHead(previous: CanonicalHead | undefined, next: CanonicalHead, addedBytes: number, recovery = false) {
  const base = (previous?.quota.usedBytes ?? 0) - (previous ? storedBytes('heads', previous.gameId, previous) : 0) + addedBytes;
  const out = structuredClone(next);
  for (let i = 0; i < 16; i++) {
    const bytes = base + storedBytes('heads', out.gameId, out);
    if (bytes === out.quota.usedBytes) break;
    out.quota.usedBytes = bytes;
  }
  check(Number.isSafeInteger(out.quota.usedBytes) && out.quota.usedBytes >= 0
    && out.quota.usedBytes === base + storedBytes('heads', out.gameId, out), 'invalid byte accounting');
  check(out.quota.usedBytes <= out.quota.limitBytes - (recovery ? 0 : out.quota.reserveBytes), 'storage quota exhausted');
  return out;
}
export function appendedBytes(records: CanonicalRecord[], nodes: CanonicalIndexNode[], receipt?: CanonicalReceipt) {
  return records.reduce((sum, r) => sum + storedBytes('records', [r.gameId, r.id], r), 0)
    + nodes.reduce((sum, r) => sum + storedBytes('nodes', [r.gameId, r.node.id], r), 0)
    + (receipt ? storedBytes('receipts', [receipt.gameId, receipt.attemptId], receipt) : 0);
}

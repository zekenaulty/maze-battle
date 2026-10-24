import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { accountHead, storedBytes } from '../../src/persistence/canonical/accounting';
import { privateAdmissionBytes, validatePrivateCapacity } from '../../src/persistence/canonical/privateCapacity';
import { CANONICAL_STORES, type Json, type CanonicalRequest } from '../../src/persistence/canonical/types';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { dump as storedDump } from './canonical-private-capacity.support';

export async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    for (const store of CANONICAL_STORES) rows.push([store, await tx.objectStore(store).getAll()]);
    await tx.done; return canonicalJson(rows);
  } finally { db.close(); }
}
export async function fillQuota() {
  const { head } = await readCanonicalHead();
  validatePrivateCapacity(head.quota.privateCapacity);
  const charge = privateAdmissionBytes(head.quota.privateCapacity, head.quota.usedBytes, storedBytes('heads', head.gameId, head));
  // Exhaust ordinary admission without removing booked private capacity or cleanup funds.
  const next = accountHead(head, { ...head, quota: { ...head.quota,
    limitBytes: charge + head.quota.reserveBytes + head.quota.reservedBytes } }, 0);
  const db = await openCanonicalDatabase();
  try {
    await db.put('heads', next, next.gameId);
  } finally { db.close(); }
}
export async function auditQuota() {
  const head = (await readCanonicalHead()).head, stored = await storedDump();
  return { head, actualStoredBytes: stored.bytes, domain: stored.domain };
}
export async function changeSource(request: CanonicalRequest) {
  const db = await openCanonicalDatabase();
  try {
    const row = (await db.get('receipts', [request.expected.gameId, request.attemptId]))!;
    row.fingerprint = canonicalJson(request); await db.put('receipts', row, [row.gameId, row.attemptId]);
  } finally { db.close(); }
}
export async function corruptRecord(row: { id: string; value: Json }, gameId: string) {
  const db = await openCanonicalDatabase();
  try {
    const value = await db.get('records', [gameId, row.id]);
    await db.put('records', { ...value!, value: { corrupt: true } }, [gameId, row.id]);
  } finally { db.close(); }
}

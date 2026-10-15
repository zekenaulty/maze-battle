import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { CANONICAL_STORES, type Json, type CanonicalRequest } from '../../src/persistence/canonical/types';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';

export async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    for (const store of CANONICAL_STORES) rows.push([store, await tx.objectStore(store).getAll()]);
    await tx.done; return canonicalJson(rows);
  } finally { db.close(); }
}
export async function fillQuota() {
  const db = await openCanonicalDatabase();
  try {
    const { head } = await readCanonicalHead();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId);
  } finally { db.close(); }
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

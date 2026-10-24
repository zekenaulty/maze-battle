import { accountHead, storedBytes } from '../../src/persistence/canonical/accounting';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { privateAdmissionBytes, validatePrivateCapacity } from '../../src/persistence/canonical/privateCapacity';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { dump } from './canonical-private-capacity.support';

/** Exhaust ordinary headroom while preserving the established private and recovery envelopes. */
export async function exhaustOrdinaryQuota() {
  const before = (await readCanonicalHead()).head;
  validatePrivateCapacity(before.quota.privateCapacity);
  const admissionBytes = privateAdmissionBytes(before.quota.privateCapacity, before.quota.usedBytes,
    storedBytes('heads', before.gameId, before));
  const limitBytes = admissionBytes + before.quota.reserveBytes + before.quota.reservedBytes;
  const head = accountHead(before, { ...before, quota: { ...before.quota, limitBytes } }, 0);
  const db = await openCanonicalDatabase();
  try { await db.put('heads', head, head.gameId); } finally { db.close(); }
  return { before, head, admissionBytes, actualStoredBytes: (await dump()).bytes,
    ordinaryRemaining: head.quota.limitBytes - admissionBytes - head.quota.reserveBytes - head.quota.reservedBytes };
}

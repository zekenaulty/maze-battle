import { accountHead, storedBytes } from '../../src/persistence/canonical/accounting';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { privateAdmissionBytes, validatePrivateCapacity } from '../../src/persistence/canonical/privateCapacity';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence, executeCanonical } from '../../src/persistence/canonical/transaction';
import type { CanonicalHead } from '../../src/persistence/canonical/types';
import { dump } from './canonical-private-capacity.support';
import { storageProbe } from './storage-probe';

function charge(head: CanonicalHead) {
  validatePrivateCapacity(head.quota.privateCapacity);
  return privateAdmissionBytes(head.quota.privateCapacity, head.quota.usedBytes, storedBytes('heads', head.gameId, head));
}

export async function audit() {
  const head = (await readCanonicalHead()).head, stored = await dump(), admissionBytes = charge(head);
  return { head, actualStoredBytes: stored.bytes, admissionBytes,
    ordinaryRemaining: head.quota.limitBytes - head.quota.reserveBytes - head.quota.reservedBytes - admissionBytes };
}

/** Exhaust ordinary admission, not the retained private envelope or cleanup funds. */
export async function fillQuota() {
  const before = (await readCanonicalHead()).head;
  const limitBytes = charge(before) + before.quota.reserveBytes + before.quota.reservedBytes;
  const next = accountHead(before, { ...before, quota: { ...before.quota, limitBytes } }, 0);
  const db = await openCanonicalDatabase();
  try { await db.put('heads', next, next.gameId); } finally { db.close(); }
  return { before, ...await audit() };
}

export async function refuseOrdinary() {
  const before = await dump(), head = (await readCanonicalHead()).head, probe = storageProbe();
  let error = '', called = false;
  try {
    await executeCanonical({ attemptId: crypto.randomUUID(), expected: canonicalFence(head),
      operation: 'fixture.transport.quota', input: {}, deadlineAt: null }, async tx => {
      called = true;
      await tx.pages.set('world', 'fixture/transport-quota', { mustNotCommit: true });
      return true;
    });
  } catch (cause) { error = String(cause); }
  const native = probe.finish(), after = await dump();
  return { error, called, unchanged: after.content === before.content, beforeBytes: before.bytes, afterBytes: after.bytes, native };
}

let probe: ReturnType<typeof storageProbe> | undefined;
export function startProbe() {
  if (probe) throw Error('Transport quota probe already active');
  probe = storageProbe();
}
export function finishProbe() {
  if (!probe) throw Error('Transport quota probe is not active');
  const result = probe.finish(); probe = undefined; return result;
}

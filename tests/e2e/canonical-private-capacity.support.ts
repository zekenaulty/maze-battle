import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence, executeCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { emptyPrivateCapacity, privateAdmissionBytes } from '../../src/persistence/canonical/privateCapacity';
import { CANONICAL_STORES, MIN_TERMINAL_BYTES, type CanonicalHead, type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';

export type PolicyFault = 'missing' | 'tampered' | 'overbooked';
export function command(head: CanonicalHead, operation: string, input: Json = {}): CanonicalRequest {
  return { attemptId: crypto.randomUUID(), operation, input, expected: canonicalFence(head), deadlineAt: null };
}
export const current = async () => (await readCanonicalHead()).head;
export const policyOf = (head: CanonicalHead): unknown => Reflect.get(head.quota, 'privateCapacity');

export async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly');
    const rows: { store: string; entries: unknown[][] }[] = [];
    let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push({ store: name, entries: values.map((value, i) => [keys[i], value]) });
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done;
    return { content: JSON.stringify(rows), domain: JSON.stringify(rows.filter(r => ['records', 'nodes'].includes(r.store))), bytes };
  } finally { db.close(); }
}

export async function seed() {
  const genesis = await initializeCanonical('capacity-owner', { sentinel: 'original checkpoint' }, async pages => {
    await pages.set('world', 'fixture/world', { unchanged: true });
    await pages.set('knowledge', 'fixture/known', { source: 'earned fixture' });
    await pages.set('execution', 'fixture/execution', { original: true });
  });
  const effect = command(genesis.head, 'fixture.effect', { once: true }); effect.deadlineAt = Date.now() + 60_000;
  const committed = await executeCanonical(effect, async tx => {
    await tx.pages.set('world', 'fixture/effect', { count: 1 }); return { count: 1 };
  });
  const admission = command(await current(), 'operation.admit', { operationId: 'funded-original',
    binding: { source: effect.attemptId, target: 'fixture-known' }, terminalBytes: MIN_TERMINAL_BYTES });
  const admitted = await operateCanonical(admission, 'admit', async () => ({ admitted: true }));
  return { genesis: genesis.head, effect, committed, admission, admitted };
}

/** Fault injection only. Preserve actual occupancy; do not call the admission calculator to hide raw bytes. */
export async function damagePolicy(fault: PolicyFault) {
  const before = await current(), next = structuredClone(before), policy = emptyPrivateCapacity();
  if (fault === 'missing') Reflect.deleteProperty(next.quota, 'privateCapacity');
  else Reflect.set(next.quota, 'privateCapacity', fault === 'tampered'
    ? { ...policy, allocatedBytes: 1, consumedBytes: 2 }
    : { ...policy, allocatedBytes: next.quota.limitBytes });
  const base = before.quota.usedBytes - storedBytes('heads', before.gameId, before);
  for (let n = 0; n < 16; n++) {
    const bytes = base + storedBytes('heads', next.gameId, next);
    if (bytes === next.quota.usedBytes) break;
    next.quota.usedBytes = bytes;
  }
  if (next.quota.usedBytes !== base + storedBytes('heads', next.gameId, next)) throw Error('fault accounting did not converge');
  const db = await openCanonicalDatabase();
  try { await db.put('heads', next, next.gameId); } finally { db.close(); }
  return { head: next, headBytes: storedBytes('heads', next.gameId, next),
    charge: fault === 'overbooked' ? privateAdmissionBytes({ ...policy, allocatedBytes: next.quota.limitBytes },
      next.quota.usedBytes, storedBytes('heads', next.gameId, next)) : null };
}

export async function refusal(run: (called: () => void) => Promise<unknown>) {
  const before = await dump(); let called = 0, error = '';
  try { await run(() => { called++; }); } catch (cause) { error = String(cause); }
  return { before, after: await dump(), called, error };
}

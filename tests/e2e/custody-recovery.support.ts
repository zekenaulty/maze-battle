import { accountHead, storedBytes } from '../../src/persistence/canonical/accounting';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence, controlCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { CANONICAL_STORES, MIN_RECOVERY_BYTES, MIN_TERMINAL_BYTES, type CanonicalHead,
  type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';

export const owner = (n: number) => `owner-${n}`.padEnd(128, 'o');
export const command = (head: CanonicalHead, operation: string, input: Json): CanonicalRequest => ({
  attemptId: crypto.randomUUID().padEnd(128, 'a'), expected: canonicalFence(head), operation, input, deadlineAt: null,
});
export const current = async () => (await readCanonicalHead()).head;
export const failure = async (work: () => unknown) => {
  try { await work(); return 'unexpected success'; } catch (error) { return String(error); }
};

export async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push([name, values]);
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done; return { content: JSON.stringify(rows), bytes };
  } finally { db.close(); }
}

export async function fullNormalQuota() {
  const head = await current(), db = await openCanonicalDatabase();
  try {
    // Fixture-only capacity policy injection preserves accounting and all funded operation bytes.
    const next = accountHead(head, { ...head, quota: { ...head.quota,
      reserveBytes: MIN_RECOVERY_BYTES,
      limitBytes: head.quota.usedBytes + head.quota.reservedBytes + MIN_RECOVERY_BYTES + 32 } }, 0);
    await db.put('heads', next, next.gameId);
  } finally { db.close(); }
}

export async function admit(count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `original-${i}`.padEnd(128, 'x'); ids.push(id);
    await operateCanonical(command(await current(), 'operation.admit', {
      operationId: id, binding: { source: 'original-action', data: '\\"'.repeat(512) }, terminalBytes: MIN_TERMINAL_BYTES,
    }), 'admit', async () => ({ original: i }));
  }
  return ids;
}

export async function seeded(count = 16) {
  await initializeCanonical(owner(0), { untouched: 'checkpoint' }, async pages => {
    await pages.set('world', 'fixture/retained', { source: 'world' });
    await pages.set('knowledge', 'fixture/retained', { source: 'earned' });
  });
  const ids = await admit(count); await fullNormalQuota();
  const ready = await current();
  await controlCanonical(command(ready, 'control.stop', { owner: ready.owner }), 'stop');
  return { ids, stopped: await current() };
}

export async function cleanup(ids: string[]) {
  let exact = true, wrongTerminal = '';
  for (const operationId of ids) {
    const request = command(await current(), 'operation.cancel', { operationId });
    const cancelled = await operateCanonical(request, 'cancel');
    const before = await dump(), replay = await operateCanonical(request, 'cancel');
    exact &&= replay.replayed && JSON.stringify(replay.receipt) === JSON.stringify(cancelled.receipt)
      && before.content === (await dump()).content;
    const ack = command(await current(), 'operation.acknowledge', { operationId, terminalAttemptId: cancelled.receipt.attemptId });
    if (!wrongTerminal) {
      wrongTerminal = await failure(() => operateCanonical({ ...ack, input: { operationId, terminalAttemptId: 'wrong-terminal' } }, 'acknowledge'));
      exact &&= before.content === (await dump()).content;
    }
    await operateCanonical(ack, 'acknowledge');
    const after = await dump(); await operateCanonical(ack, 'acknowledge');
    exact &&= after.content === (await dump()).content;
  }
  const operations = (await readCanonical(async pages => {
    const states = [];
    for (const id of ids) {
      const row = await pages.liveOperation(id);
      if (!row) throw Error('Missing original operation');
      states.push({ state: row.state, disposition: row.terminal?.disposition, owner: row.owner });
    }
    return states;
  })).value;
  const head = await current();
  return { exact, wrongTerminal, operations, head, accounted: (await dump()).bytes === head.quota.usedBytes };
}

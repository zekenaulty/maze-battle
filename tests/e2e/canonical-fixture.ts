import * as lifecycle from '../../src/persistence/canonical/lifecycle';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { MIN_TERMINAL_BYTES, ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';
import { storageProbe } from './storage-probe';
import * as world from './canonical-world-fixture';
import * as roster from './canonical-roster-fixture';

function command(head: CanonicalHead, operation = 'test.change', input: Json = {}, attemptId: string = crypto.randomUUID()): CanonicalRequest {
  return { attemptId, operation, input, expected: transaction.canonicalFence(head), deadlineAt: null };
}

async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push([name, values]);
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done;
    return { content: JSON.stringify(rows), bytes };
  } finally { db.close(); }
}

async function admitFixtureOperation(quota?: { limitBytes: number; reserveBytes: number }) {
  const { head } = await lifecycle.initializeCanonical('owner', {}, undefined, { quota });
  const input = command(head, 'operation.admit', { operationId: 'operation-1',
    binding: { target: 'known-room', actionId: 'original-action' }, terminalBytes: MIN_TERMINAL_BYTES });
  const outcome = await transaction.operateCanonical(input, 'admit', async () => ({ admitted: true }));
  return { input, outcome, head: (await reader.readCanonicalHead()).head };
}

async function fillNormalCapacity() {
  for (let count = 0; count < 1024; count++) {
    const { head } = await reader.readCanonicalHead();
    try { await transaction.executeCanonical(command(head, 'fixture.fill'), async tx => { tx.setCheckpoint({ count }); return count; }); }
    catch (error) { if (String(error).includes('storage quota exhausted')) return count; throw error; }
  }
  throw Error('Fixture did not reach admission ceiling');
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5209') throw new Error('Isolated canonical fixture only');
const api = { ...lifecycle, ...transaction, ...reader, openCanonicalDatabase, command, dump, storageProbe, world, roster,
  admitFixtureOperation, fillNormalCapacity, MIN_TERMINAL_BYTES, ACKNOWLEDGEMENT_BYTES };
declare global { interface Window { canonical: typeof api } }
window.canonical = api;

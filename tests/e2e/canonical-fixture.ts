import * as lifecycle from '../../src/persistence/canonical/lifecycle';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { storageProbe } from './storage-probe';

function command(head: CanonicalHead, operation = 'test.change', input: Json = {}, attemptId = crypto.randomUUID()): CanonicalRequest {
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

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5209') throw new Error('Isolated canonical fixture only');
const api = { ...lifecycle, ...transaction, ...reader, openCanonicalDatabase, command, dump, storageProbe };
declare global { interface Window { canonical: typeof api } }
window.canonical = api;

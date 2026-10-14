import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { acknowledgeCanonical, canonicalFence, controlCanonical, executeCanonical, operateCanonical, replayAcknowledgement } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { sealOperation, MAX_ACK_PROOF_BYTES } from '../../src/persistence/canonical/operationValidation';
import { fingerprint, jsonBytes } from '../../src/persistence/canonical/validation';
import { ACKNOWLEDGEMENT_BYTES, CANONICAL_STORES, MAX_RESERVATIONS, MIN_TERMINAL_BYTES, type CanonicalHead, type CanonicalRequest, type Json, type JsonObject } from '../../src/persistence/canonical/types';

if (location.origin !== 'http://127.0.0.1:5243') throw new Error('Verified ACK fixture requires its isolated origin');

function command(head: CanonicalHead, operation: string, input: Json, attemptId: string = crypto.randomUUID()): CanonicalRequest {
  return { attemptId, operation, input, expected: canonicalFence(head), deadlineAt: null };
}
async function fresh(operation: string, input: Json, attemptId?: string) {
  return command((await readCanonicalHead()).head, operation, input, attemptId);
}
async function failure(work: () => unknown | Promise<unknown>) {
  try { await work(); return ''; } catch (error) { return String(error); }
}
async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly');
    const rows: unknown[] = []; let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push([name, keys, values]);
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done; return { content: JSON.stringify(rows), bytes };
  } finally { db.close(); }
}
async function seed(owner = 'verified-owner', limitBytes = 3 * 1024 * 1024) {
  return initializeCanonical(owner, { position: 'unchanged' }, async pages => {
    await pages.set('world', 'secret', { hidden: true });
    await pages.set('knowledge', 'earned', { seen: true });
    await pages.set('execution', 'proof-source', { admitted: true });
  }, { quota: { limitBytes, reserveBytes: 65536 } });
}
async function admit(operationId = 'verified-operation', verified = true, attemptId?: string) {
  const request = await fresh('operation.admit', { operationId, binding: { action: 'original' },
    terminalBytes: MIN_TERMINAL_BYTES, ...(verified ? { ackPolicy: 'verified-host' } : {}) }, attemptId);
  const commit = await operateCanonical(request, 'admit', async () => verified ? { host: { actionResult: { key: 'original-result' } } } : null);
  return { request, commit };
}
async function settled(verified = true) {
  await seed(); const admission = await admit('verified-operation', verified);
  const terminal = await fresh('operation.cancel', { operationId: 'verified-operation' });
  await operateCanonical(terminal, 'cancel');
  const ack = await fresh('operation.acknowledge', { operationId: 'verified-operation', terminalAttemptId: terminal.attemptId, proof: { accepted: true } });
  return { admission: admission.request, terminal, ack };
}
function maximumProof(): JsonObject {
  const proof = { data: '"\\'.repeat(1530) };
  proof.data += 'x'.repeat(MAX_ACK_PROOF_BYTES - jsonBytes(proof));
  return proof;
}
async function fillNormalCapacity() {
  let writes = 0;
  // First consume in large receipts, then exhaust the smaller receipt allowance.
  for (const result of ['x'.repeat(12000), null]) {
    for (let i = 0; i < 1024; i++) {
      const request = await fresh('fixture.fill', {});
      try { await executeCanonical(request, async () => result); writes++; }
      catch (error) {
        if (!String(error).includes('storage quota exhausted')) throw error;
        break;
      }
      if (i === 1023) throw new Error('Fixture did not reach its bounded quota');
    }
  }
  return writes;
}

const fixture = { acknowledgeCanonical, controlCanonical, executeCanonical, operateCanonical, replayAcknowledgement,
  readCanonical, readCanonicalHead, openCanonicalDatabase, sealOperation, fingerprint, jsonBytes,
  ACKNOWLEDGEMENT_BYTES, MAX_ACK_PROOF_BYTES, MAX_RESERVATIONS, MIN_TERMINAL_BYTES,
  command, fresh, failure, dump, seed, admit, settled, maximumProof, fillNormalCapacity };
declare global { interface Window { verifiedAck: typeof fixture } }
window.verifiedAck = fixture;

import * as actions from '../../src/persistence/canonical/agentica/actions';
import * as publication from '../../src/persistence/canonical/agentica/publication';
import type { ProtocolRef, PendingAction } from '../../src/persistence/canonical/agentica/types';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, MIN_TERMINAL_BYTES, type CanonicalHead, type CanonicalRequest, type Json } from '../../src/persistence/canonical/types';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { protocolHead, protocolAction, protocolResult } from '../../src/persistence/canonical/agentica/types.test-support';
import { observationKey, KNOWLEDGE_PREFIX } from '../../src/persistence/canonical/knowledge/keys';
import { earnedCell } from '../../src/persistence/canonical/knowledge/region.test-support';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { observationChunksDigest, observationDigest, retainObservationIntegrity } from '../../src/persistence/canonical/knowledge/observation.integrity';
import { fingerprint } from '../../src/persistence/canonical/validation';
import { reference } from '../../src/persistence/canonical/agentica/validation';
import { storageProbe } from './storage-probe';

const command = (head: CanonicalHead, operation: string, input: Json = {}): CanonicalRequest => ({
  attemptId: crypto.randomUUID(), expected: transaction.canonicalFence(head), operation, input, deadlineAt: null,
});
function resultReference(result: Json): ProtocolRef {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Missing result');
  reference(result.reference); return result.reference;
}
async function seed() {
  await initializeCanonical('owner', protocolHead().checkpoint, async pages => { await pages.set('world', 'fixture/world', 0); });
  const head = (await reader.readCanonicalHead()).head, request = command(head, 'fixture.observe');
  await transaction.executeCanonical(request, async tx => {
    const cell = earnedCell(), key = observationKey(1);
    const chunk = await tx.pages.set('knowledge', `${key}/0`, { schema: 1, sequence: 1, offset: 0, cells: [cell] } as never);
    const row = await tx.pages.set('knowledge', key, { schema: 1, sequence: 1, previous: null, owner: head.owner, epoch: head.epoch,
      revision: head.revision + 1, observedAt: head.checkpoint.updatedAt, actor: cell.at, policy: 'linked-vision-v1', radius: 7, count: 1, chunks: [chunk.id],
      chunksDigest: observationChunksDigest([observationDigest(chunk)]) } as never);
    await retainObservationIntegrity(tx.pages, row, [chunk]);
    tx.setCheckpoint({ ...head.checkpoint, knowledge: { sequence: 1, id: row.id, witness: (await tx.pages.witness('knowledge', KNOWLEDGE_PREFIX))! } });
    return true;
  });
  return (await reader.readCanonicalHead()).head;
}
async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    for (const store of CANONICAL_STORES) rows.push([store, await tx.objectStore(store).getAll()]);
    await tx.done; return JSON.stringify(rows);
  } finally { db.close(); }
}
async function publish(request?: CanonicalRequest) {
  request ??= command((await reader.readCanonicalHead()).head, 'agentica.publish');
  const outcome = await transaction.executeCanonical(request, async tx => (await publication.retainPublication(tx, request!)).receipt);
  return { request, outcome, reference: resultReference(outcome.receipt.result) };
}
async function pending(action: AgenticaAction, ref: ProtocolRef, effect: PendingAction['effect'] = 'readOnly', request?: CanonicalRequest) {
  const identity = await actions.prepareAction(action);
  request ??= command((await reader.readCanonicalHead()).head, 'agentica.pending', { actionKey: identity.key, publication: { ...ref }, effect });
  const outcome = await transaction.executeCanonical(request, async tx => (await actions.retainPendingAction(tx, request!, identity, ref, effect)).receipt);
  return { request, outcome, reference: resultReference(outcome.receipt.result) };
}
async function complete(action: AgenticaAction, result: AgenticaResult, request?: CanonicalRequest, worldEffect = false) {
  const identity = await actions.prepareAction(action);
  request ??= command((await reader.readCanonicalHead()).head, 'agentica.result', { actionKey: identity.key });
  const outcome = await transaction.executeCanonical(request, async tx => {
    const stored = await actions.retainActionResult(tx, request!, identity, result);
    if (worldEffect) await tx.pages.set('world', 'fixture/effect', { action: action.actionId });
    return stored.receipt;
  });
  return { request, outcome, reference: resultReference(outcome.receipt.result) };
}
async function read(action: AgenticaAction) {
  const identity = await actions.prepareAction(action);
  return reader.readCanonical(pages => actions.readAction(pages, identity));
}
async function reconcile(action: AgenticaAction) {
  const identity = await actions.prepareAction(action);
  return reader.readCanonical(pages => actions.reconcileAction(pages, identity));
}
async function change(area: 'world' | 'knowledge' | 'execution' = 'execution') {
  const request = command((await reader.readCanonicalHead()).head, 'fixture.change');
  return transaction.executeCanonical(request, async tx => { await tx.pages.set(area, 'fixture/change', 1); return true; });
}
async function takeover() {
  await transaction.controlCanonical(command((await reader.readCanonicalHead()).head, 'control.takeover', { owner: 'successor' }), 'takeover');
  await transaction.controlCanonical(command((await reader.readCanonicalHead()).head, 'control.resume', { owner: 'successor' }), 'resume');
}
if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5231') throw Error('Isolated Agentica records fixture only');
const api = { ...actions, ...publication, ...transaction, ...reader, openCanonicalDatabase, command, seed, dump, publish, pending,
  complete, read, reconcile, change, takeover, protocolAction, protocolResult, canonicalJson, fingerprint, loadObservation, storageProbe, MIN_TERMINAL_BYTES,
  navigationFixture: () => import('./canonical-agentica-navigation.fixture') };
declare global { interface Window { agenticaRecords: typeof api } }
window.agenticaRecords = api;

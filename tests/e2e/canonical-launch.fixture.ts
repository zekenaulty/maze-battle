import * as launch from '../../src/persistence/canonical/agentica/launch';
import * as terminal from '../../src/persistence/canonical/agentica/launch.terminal';
import * as publication from '../../src/persistence/canonical/agentica/publication';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as read from '../../src/persistence/canonical/read';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, MIN_TERMINAL_BYTES, type CanonicalHead, type CanonicalRequest, type Json, type JsonObject } from '../../src/persistence/canonical/types';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { protocolAction, protocolHead } from '../../src/persistence/canonical/agentica/types.test-support';
import { launchStartFixture, launchStartedFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { fingerprint } from '../../src/persistence/canonical/validation';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';

const command = (head: CanonicalHead, operation: string, input: Json = {}): CanonicalRequest => ({
  attemptId: crypto.randomUUID(), expected: transaction.canonicalFence(head), operation, input, deadlineAt: null,
});
async function publish() {
  const head = (await read.readCanonicalHead()).head, request = command(head, 'agentica.publish');
  const outcome = await transaction.executeCanonical(request, async tx => (await publication.retainPublication(tx, request)).receipt);
  return { head, ref: (outcome.receipt.result as JsonObject).reference as unknown as ProtocolRef };
}
async function seed() {
  await initializeCanonical('owner', protocolHead().checkpoint, undefined, { quota: { limitBytes: 512 * 1024, reserveBytes: 64 * 1024 } });
  return binding('launch');
}
async function binding(id: string) {
  const pub = await publish(), start = launchStartFixture(pub.head.revision, String(pub.head.epoch));
  start.sessionId = launch.launchSessionId(pub.head.gameId, id);
  return launch.createLaunchBinding({ launchId: id, endpoint: 'ws://127.0.0.1:5000/host', publication: pub.ref, start });
}
async function admit(binding: JsonObject) {
  const request = command((await read.readCanonicalHead()).head, 'operation.admit', {
    operationId: launch.launchGuardId(binding.launchId as string), binding, terminalBytes: MIN_TERMINAL_BYTES,
  });
  return { request, outcome: await launch.executeLaunchCommand(request) };
}
async function transition(operation: 'dispatch' | 'announce' | 'grant', id = 'launch', extra: JsonObject = {}) {
  const request = command((await read.readCanonicalHead()).head, `agentica.launch.${operation}`, { launchId: id, ...extra });
  return { request, outcome: await launch.executeLaunchCommand(request) };
}
async function announce() {
  const current = (await launch.readLaunch('launch')).value!;
  return transition('announce', 'launch', { dispatch: { ...current.dispatch!.ref }, started: launchStartedFixture(current.binding.start) as unknown as JsonObject });
}
async function grant() {
  const current = (await launch.readLaunch('launch')).value!;
  return transition('grant', 'launch', { run: { ...current.run!.ref }, publication: { ...current.binding.publication } });
}
async function ready() { const input = await seed(), admission = await admit(input); await transition('dispatch'); await announce(); await grant(); return admission; }
async function gate() {
  const current = (await launch.readLaunch('launch')).value!, head = (await read.readCanonicalHead()).head;
  const action = { ...protocolAction(current.publication.wireRevision), ...current.run!.value.data.started, capabilityId: 'maze.observe', deadlineAt: '2099-01-01T00:00:00.000Z' };
  // Only SDK action fields cross the gate; announcement-only scope fields are not action input.
  const wire = { ...protocolAction(current.publication.wireRevision), runId: action.runId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
    manifestHash: action.manifestHash, capabilityId: action.capabilityId, deadlineAt: action.deadlineAt };
  return transaction.executeCanonical(command(head, 'fixture.effect'), async tx => {
    await launch.assertLaunchGrant(tx, current.grant?.ref ?? { key: 'agentica/launches/launch/grant', id: 'missing' }, wire, current.binding.publication);
    await tx.pages.set('execution', 'fixture/effect', true); return true;
  });
}
async function stop() {
  const request = command((await read.readCanonicalHead()).head, 'operation.cancel', { operationId: launch.launchGuardId('launch') });
  return { request, outcome: await transaction.operateCanonical(request, 'cancel') };
}
async function ack(terminalAttemptId: string) {
  const request = command((await read.readCanonicalHead()).head, 'operation.acknowledge', { operationId: launch.launchGuardId('launch'), terminalAttemptId });
  return { request, outcome: await transaction.operateCanonical(request, 'acknowledge') };
}
async function takeover() {
  await transaction.controlCanonical(command((await read.readCanonicalHead()).head, 'control.takeover', { owner: 'successor' }), 'takeover');
  await transaction.controlCanonical(command((await read.readCanonicalHead()).head, 'control.resume', { owner: 'successor' }), 'resume');
}
async function dump() {
  const db = await openCanonicalDatabase();
  try { const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = []; let bytes = 0;
    for (const name of CANONICAL_STORES) { const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push([name, values]); if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); }); }
    await tx.done; return { content: JSON.stringify(rows), bytes };
  } finally { db.close(); }
}
async function fillNormalCapacity() {
  for (let i = 0; i < 1024; i++) {
    try { await transaction.executeCanonical(command((await read.readCanonicalHead()).head, 'fixture.fill'), async () => i); }
    catch (error) { if (String(error).includes('storage quota exhausted')) return; throw error; }
  } throw Error('Did not reach quota');
}
if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5234') throw Error('Isolated canonical launch fixture only');
const api = { ...launch, ...terminal, ...transaction, ...read, ...publication, openCanonicalDatabase, command, seed, binding, admit, transition,
  announce, grant, ready, gate, stop, ack, takeover, dump, fillNormalCapacity, publish, canonicalJson, fingerprint, launchStartedFixture, protocolAction };
declare global { interface Window { canonicalLaunch: typeof api } }
window.canonicalLaunch = api;

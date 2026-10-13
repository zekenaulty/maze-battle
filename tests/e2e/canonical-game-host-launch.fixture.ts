import { GameSession } from '../../src/services/game/GameSession';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { assertLaunchGrant, createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchStartFixture, launchStartedFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { protocolAction } from '../../src/persistence/canonical/agentica/types.test-support';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { json } from '../../src/persistence/canonical/world/records';

async function start() {
  const s = new GameSession(() => {}); await s.start();
  const head = (await readCanonicalHead()).head;
  const pub = await s.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication', input: {},
    execute: (r, options) => executeCanonical(r, async tx => (await retainPublication(tx, r)).receipt, options) });
  const publication = (pub.result as JsonObject).reference as unknown as ProtocolRef;
  const start = launchStartFixture(head.revision, String(head.epoch));
  start.sessionId = launchSessionId(head.gameId, 'launch');
  start.observation = { observationId: s.view.game!.checkpoint.knowledge!.id, revision: head.revision,
    observedAt: s.view.game!.observation!.header.observedAt, data: { position: { ...s.view.game!.checkpoint.position } } };
  const binding = createLaunchBinding({ launchId: 'launch', endpoint: 'ws://127.0.0.1:5000/host', start, publication });
  await s.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: launchGuardId('launch'), binding, terminalBytes: MIN_TERMINAL_BYTES }, execute: executeLaunchCommand });
  await s.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId: 'launch' }, execute: executeLaunchCommand });
  const launch = (await readLaunch()).value!;
  // Simulate a service announcement only. No SDK transport or provider is called.
  await s.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId: 'launch', dispatch: { ...launch.dispatch!.ref }, started: json(launchStartedFixture(start)) }, execute: executeLaunchCommand });
  return { s, publication, target: { gameId: head.gameId, generation: head.generation, operationId: launchGuardId('launch') } };
}
async function grant(s: GameSession, publication: ProtocolRef) {
  const launch = (await readLaunch()).value!;
  return s.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId: 'launch', run: { ...launch.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
}
async function effect(s: GameSession, publication: ProtocolRef) {
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  const action = { ...protocolAction(launch.publication.wireRevision), runId: run.runId, sessionId: run.sessionId,
    sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash, capabilityId: 'maze.observe',
    deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  return s.submitHostCommand({ kind: 'fresh', operation: 'fixture.granted-effect', input: {}, execute: (r, options) => executeCanonical(
    { ...r, deadlineAt: Math.min(r.deadlineAt ?? Infinity, Date.parse(action.deadlineAt)) }, async tx => {
      await assertLaunchGrant(tx, launch.grant?.ref ?? { key: 'agentica/launches/launch/grant', id: 'absent' }, action, publication);
      // A host-only marker tests the gate; it is not an advertised maze.observe implementation.
      await tx.pages.set('execution', 'fixture/granted', true); return { accepted: true };
    }, options) });
}
export async function announcementIsNotPermission() {
  const { s, publication } = await start();
  const refused = await effect(s, publication).catch(String); await s.flush();
  const absent = (await readCanonical(p => p.get('execution', 'fixture/granted'))).value === undefined;
  await s.takeControl(); await grant(s, publication); const result = await effect(s, publication);
  const launch = (await readLaunch()).value!; s.stop();
  return { refused, absent, result: result.result, sourceId: launch.binding.start.observation.observationId,
    originalId: launch.publication.observation!.id, guard: launch.guard.state };
}
export async function stoppedGuard() {
  const { s, publication, target } = await start(); await grant(s, publication);
  await s.cleanupHostOperation({ kind: 'cancel', target });
  const refused = await effect(s, publication).catch(String); await s.flush();
  const absent = (await readCanonical(p => p.get('execution', 'fixture/granted'))).value === undefined;
  s.stop(); return { refused, absent };
}
export async function manualObservation() {
  const { s, publication } = await start(); await grant(s, publication);
  await s.execute('exploration', { kind: 'move', direction: 'south', triggerStairs: false });
  const before = (await readCanonicalHead()).head;
  const refused = await effect(s, publication).catch(String); await s.flush();
  const after = (await readCanonicalHead()).head; s.stop();
  return { refused, unchanged: JSON.stringify(before) === JSON.stringify(after) };
}
Object.assign(window, { hostLaunchFixture: { announcementIsNotPermission, stoppedGuard, manualObservation } });

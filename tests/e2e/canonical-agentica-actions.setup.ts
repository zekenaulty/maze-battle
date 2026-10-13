import { GameSession } from '../../src/services/game/GameSession';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchStartFixture, launchStartedFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { json } from '../../src/persistence/canonical/world/records';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import { flatAddress } from '../../src/services/agentica/game/validation';

export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export async function startGame() {
  const session = new GameSession(() => {});
  await session.start();
  if (!session.view.controlled || !session.view.game?.observation) throw Error(session.view.status);
  return session;
}
export async function fundLaunch(session: GameSession) {
  const head = (await readCanonicalHead()).head;
  const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input: {},
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  const publication = (receipt.result as JsonObject).reference as unknown as ProtocolRef;
  const observation = (await readCanonical((pages, snapshot) => observeMaze(pages, snapshot, publication))).value;
  const launchId = crypto.randomUUID(), start = { ...launchStartFixture(observation.revision, String(head.epoch)),
    sessionId: launchSessionId(head.gameId, launchId), scopeId: crypto.randomUUID(), objectiveId: crypto.randomUUID(),
    observation, capabilities: mazeCapabilities() };
  const binding = createLaunchBinding({ launchId, endpoint: 'ws://127.0.0.1:5236/offline-only', publication, start });
  await session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: launchGuardId(launchId), binding, terminalBytes: MIN_TERMINAL_BYTES }, execute: executeLaunchCommand });
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  // Only a retained started fixture, never SDK start/connect or a service/provider call.
  const started = { ...launchStartedFixture(start), runId: crypto.randomUUID() };
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref }, started: json(started) }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
  return { launchId, start, binding, publication };
}
export function earnedTargets(session: GameSession) {
  const game = session.view.game!, sight = game.observation!, actor = flatAddress(game.checkpoint.position);
  const current = sight.cells.find(cell => JSON.stringify(cell.at) === JSON.stringify(game.checkpoint.position));
  if (!current) throw Error('Missing observed actor');
  const next = Object.values(current.edges).find(to => to && sight.cells.some(cell => JSON.stringify(cell.at) === JSON.stringify(to)));
  if (!next) throw Error('Fresh game has no earned adjacent destination');
  return { actor, target: flatAddress(next), cell: current };
}

import type { GameSession } from '../../src/services/game/GameSession';
import type { Direction } from '../../src/domain/types';
import { opposite } from '../../src/domain/maze/movement';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchProofFixture, launchStartFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import { executePublicationRenewal, readPublicationSelection } from '../../src/persistence/canonical/agentica/publication-selection';
import { seedJournal } from './canonical-agentica-quests.setup';
import { prepareAppChest, chestEffects } from './canonical-start-service.chest-fixture';

export async function publish(session: GameSession, input: JsonObject = {}) {
  const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input,
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  return (receipt.result as JsonObject).reference as unknown as ProtocolRef;
}
export async function setup(mode: 'pending' | 'route' | 'unbound' | 'old-scope') {
  const seeded = await seedJournal({ accept: 0 }), session = seeded.session;
  let route: Awaited<ReturnType<typeof prepareAppChest>> | undefined, questId: string;
  if (mode === 'route') {
    // Reuse only the manual GameSession setup seam; this fixture does not mount or qualify the App UI.
    Reflect.set(globalThis, '__canonicalStartAppSession', session);
    try { route = await prepareAppChest(); questId = route.contract.id; }
    finally { Reflect.deleteProperty(globalThis, '__canonicalStartAppSession'); }
  } else {
    const offer = seeded.offers.find(q => q.task.objective === 'fetch' && q.task.required === 1)!;
    questId = offer.id;
    await session.execute('exploration', { kind: 'stairs', direction: 'up' });
    await session.execute('content', { kind: 'accept-quest', contractId: questId });
    await session.execute('roster', { kind: 'leave-town' });
  }
  const launchId = crypto.randomUUID(), objectiveId = crypto.randomUUID();
  const root = await publish(session, mode === 'unbound' ? {} : { returnQuest: { launchId, objectiveId, questId } });
  const { head } = await readCanonicalHead();
  const observation = (await readCanonical((pages, snapshot) => observeMaze(pages, snapshot, root))).value;
  const capabilities = mazeCapabilities();
  if (mode === 'old-scope') {
    const field = capabilities.find(c => c.id === 'maze.inspect')!.inputSchema.fields.find(f => f.name === 'scope')!;
    field.allowedValues = field.allowedValues!.filter(scope => scope !== 'objective');
  }
  const start = { ...launchStartFixture(observation.revision, String(head.epoch)), sessionId: launchSessionId(head.gameId, launchId),
    scopeId: launchId, objectiveId, observation, capabilities };
  const binding = createLaunchBinding({ launchId, endpoint: 'ws://127.0.0.1:5266/offline-only', publication: root, start });
  await session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: launchGuardId(launchId), binding, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }, execute: executeLaunchCommand });
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref },
      ...launchProofFixture(start, dispatched.dispatch!.source.attemptId, crypto.randomUUID()) }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication: { ...root } }, execute: executeLaunchCommand });
  return { session, root, questId, route, launch: (await readLaunch()).value! };
}
export async function renew(session: GameSession) {
  const launch = (await readLaunch()).value!, launchId = launch.binding.launchId;
  const previous = (await readCanonical(pages => readPublicationSelection(pages, launchId))).value!;
  const publication = await publish(session);
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication.renew', input: {
    launchId, grant: { ...launch.grant!.ref }, publication: { ...publication }, previousSelection: { ...previous.ref },
  }, execute: executePublicationRenewal });
  return publication;
}
export async function collectAndReturn(session: GameSession, route: NonNullable<Awaited<ReturnType<typeof setup>>['route']>) {
  const chest = await session.execute('content', { kind: 'open-chest', chestId: route.target.chestId });
  const moves = route.receipts.filter(r => r.kind === 'exploration' && (r.input as JsonObject).kind === 'move');
  for (const move of moves.toReversed()) {
    const direction = opposite((move.input as JsonObject).direction as Direction);
    await session.execute('exploration', { kind: 'move', direction, triggerStairs: false });
  }
  return { chest, steps: moves.length, effects: await chestEffects(route.target) };
}
export async function stash(session: GameSession, questId: string) {
  await session.execute('exploration', { kind: 'stairs', direction: 'up' });
  await session.execute('roster', { kind: 'stash', itemId: `quest-item:${questId}` });
  await session.execute('roster', { kind: 'leave-town' });
}

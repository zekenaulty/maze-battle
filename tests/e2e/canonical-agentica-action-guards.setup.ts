import type { AgenticaAction, AgenticaActionRecord } from '../../src/services/agentica/contracts';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import { observeMaze } from '../../src/services/agentica/game/observation';
import { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostCommand } from '../../src/services/game/CanonicalHostCommand';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchStartFixture, launchProofFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { DIRECTIONS } from '../../src/persistence/canonical/knowledge/types';
import { destinationKey } from '../../src/persistence/canonical/navigation/records';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../src/persistence/canonical/types';
import { same } from '../../src/persistence/canonical/world/records';

export type Capability = 'maze.observe' | 'maze.navigate';
export const pending = (action: AgenticaAction): AgenticaActionRecord => ({ fingerprint: actionFingerprint(action), status: 'pending' });
export const key = actionKey;
export const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
export const head = async () => (await readCanonicalHead()).head;
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export async function setup(capability: Capability = 'maze.navigate') {
  const session = new GameSession(() => {}); await session.start();
  try {
    const initial = await head(), game = session.view.game!, at = game.checkpoint.position;
    const here = game.observation!.cells.find(cell => same(cell.at, at))!;
    const direction = DIRECTIONS.find(d => here.edges[d] && game.observation!.cells.some(cell => same(cell.at, here.edges[d]!)));
    if (!direction) throw Error('Fixture requires an earned adjacent destination');
    const target = structuredClone(here.edges[direction]!);
    const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication', input: {},
      execute: (r, options) => executeCanonical(r, async tx => (await retainPublication(tx, r)).receipt, options) });
    const publication = (receipt.result as JsonObject).reference as unknown as ProtocolRef;
    const observation = (await readCanonical((pages, snapshot) => observeMaze(pages, snapshot, publication))).value;
    const start = launchStartFixture(initial.revision, String(initial.epoch));
    start.sessionId = launchSessionId(initial.gameId, 'guard-fixture'); start.observation = observation;
    start.capabilities = mazeCapabilities().filter(cap => cap.id === capability);
    const launch = createLaunchBinding({ launchId: 'guard-fixture', endpoint: 'ws://127.0.0.1:5000/host', publication, start });
    await session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
      input: { operationId: launchGuardId('guard-fixture'), binding: launch, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }, execute: executeLaunchCommand });
    await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId: 'guard-fixture' }, execute: executeLaunchCommand });
    const dispatched = (await readLaunch()).value!;
    // Wire announcement only: this fixture never connects the SDK or a provider.
    const proof = launchProofFixture(start, dispatched.dispatch!.source.attemptId), { started } = proof;
    await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
      input: { launchId: 'guard-fixture', dispatch: { ...dispatched.dispatch!.ref }, ...proof }, execute: executeLaunchCommand });
    const announced = (await readLaunch()).value!;
    await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
      input: { launchId: 'guard-fixture', run: { ...announced.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
    const binding = { grant: (await readLaunch()).value!.grant!.ref, publication };
    const submitted: { operations: string[]; inspect?: (command: CanonicalHostCommand) => void } = { operations: [] };
    const port = { get hostSignal() { return session.hostSignal; }, submitHostCommand(command: CanonicalHostCommand) {
      submitted.operations.push(command.kind === 'fresh' ? command.operation : command.request.operation);
      submitted.inspect?.(command); return session.submitHostCommand(command);
    } };
    const action: AgenticaAction = { actionId: 'guard-action', runId: started.runId, runnerRunId: 'fixture-runner', stepId: 'fixture-step',
      sessionId: started.sessionId, sessionEpoch: started.sessionEpoch, manifestHash: started.manifestHash,
      capabilityId: capability, arguments: capability === 'maze.navigate' ? { level: target.level, ...target.cell } : {},
      expectedRevision: observation.revision, deadlineAt: new Date(Date.now() + 60_000).toISOString() };
    return { session, port, submitted, binding, action, target, direction,
      hooks: createGameActionHooks(port, binding),
      guard: { gameId: initial.gameId, generation: initial.generation, operationId: launchGuardId('guard-fixture') } };
  } catch (error) { session.stop(); throw error; }
}

export async function retained(action: AgenticaAction) {
  const identity = await prepareAction(action), operationId = `travel-${identity.storageKey.slice(-64)}`;
  return (await readCanonical(async pages => ({ original: await readAction(pages, identity),
    operation: await pages.liveOperation(operationId) ?? null,
    destination: await pages.get('execution', destinationKey(operationId)) ?? null }))).value;
}

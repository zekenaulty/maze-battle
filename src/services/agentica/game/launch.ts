import type { AgenticaStart } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { MIN_TERMINAL_BYTES, type JsonObject } from '../../../persistence/canonical/types';
import { retainPublication, readPublication } from '../../../persistence/canonical/agentica/publication';
import { createLaunchBinding, executeLaunchCommand, launchGuardId, launchSessionId } from '../../../persistence/canonical/agentica/launch';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { observeMaze } from './observation';
import { mazeCapabilities } from './capabilities';

export interface GameLaunchOptions {
  endpoint: string; objectiveId: string; objective: string;
  provider: AgenticaStart['provider']; limits: AgenticaStart['limits'];
  returnQuestId?: string;
}
/** Explicit caller configuration only: no model selection, hidden target selection, or network effects. */
export async function prepareGameLaunch(port: CanonicalHostPort, input: GameLaunchOptions, launchId: string = crypto.randomUUID()) {
  const config = structuredClone(input), signal = port.hostSignal;
  launchGuardId(launchId);
  signal.throwIfAborted();
  const inputGoal: JsonObject = config.returnQuestId === undefined ? {} : {
    returnQuest: { launchId, objectiveId: config.objectiveId, questId: config.returnQuestId },
  };
  const published = await port.submitHostCommand({ kind: 'fresh', signal, operation: 'agentica.publish', input: inputGoal,
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  signal.throwIfAborted();
  const publication = (published.result as JsonObject).reference as unknown as ProtocolRef;
  const { value: start } = await readCanonical(async (pages, snapshot): Promise<AgenticaStart> => {
    const source = await readPublication(pages, publication);
    return { protocolVersion: 1, hostId: 'maze-battle', sessionId: launchSessionId(source.snapshot.gameId, launchId),
      sessionEpoch: String(source.epoch), scopeId: launchId, perspectiveId: 'party',
      objectiveId: config.objectiveId, objective: config.objective,
      observation: await observeMaze(pages, snapshot, publication), capabilities: mazeCapabilities(),
      provider: config.provider, limits: config.limits };
  }, { signal });
  const binding = createLaunchBinding({ launchId, endpoint: config.endpoint, publication, start });
  await port.submitHostCommand({ kind: 'fresh', signal, operation: 'operation.admit',
    input: { operationId: launchGuardId(launchId), binding, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }, execute: executeLaunchCommand });
  signal.throwIfAborted();
  return { launchId, publication, start };
}

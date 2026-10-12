import { ensureRpgScope, bindRpgRun } from '../../src/persistence/rpgAgentica/runs';
import { saveRpgAction } from '../../src/persistence/rpgAgentica/records';
import { executeRpgAction } from '../../src/persistence/rpgAgentica/actions';
import * as events from '../../src/persistence/rpgAgentica/events';
import { advanceRpgHostOperation as advance } from '../../src/persistence/rpgAgentica/advance';
import { actionFingerprint, actionKey, AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { RpgAgenticaBinding } from '../../src/services/agentica/rpg/contracts';
import type { RpgTravelAction } from '../../src/persistence/rpgTravel/types';
import { DEFAULT_DESTINATION_LIMITS } from '../../src/domain/directed/destinationLimits';
import type {} from './rpg-command-fixture';

export { events, advance, AgenticaHost };
export async function admitted(column = 5) {
  const h = window.rpgCommandTest, game = h.game();
  await h.repository.saveGame('auto', 'Agentica events', 'auto', game);
  const owned = await h.custody.claimGame('owner'); await h.memory.prepareRpgMemory();
  const scope = await ensureRpgScope(owned.control);
  const binding: RpgAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', ...scope, sessionId: scope.scopeId,
    sessionEpoch: String(owned.control.epoch), perspectiveId: 'party', objectiveId: 'known-destination', objective: 'Reach the known cell.',
    runId: 'run-1', manifestHash: `sha256:${'a'.repeat(64)}`, completionTarget: { floor: 1, row: 0, column: 5 },
    travelLimits: { ...DEFAULT_DESTINATION_LIMITS } };
  await bindRpgRun(binding);
  const action = { actionId: 'navigate-1', runId: binding.runId, runnerRunId: 'runner-1', stepId: 'step-1', sessionId: binding.sessionId,
    sessionEpoch: binding.sessionEpoch, capabilityId: 'maze.navigate', manifestHash: binding.manifestHash, arguments: { row: 0, column },
    expectedRevision: owned.control.revision, deadlineAt: new Date(Date.now() + 120_000).toISOString() };
  await saveRpgAction(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await executeRpgAction(action), id = admission.result.operation!.operationId;
  return { binding, action, admission, id };
}

export async function next(id: string, action?: RpgTravelAction, attemptId = crypto.randomUUID()) {
  const h = window.rpgCommandTest;
  await h.memory.prepareRpgMemory();
  const current = await h.custody.readGameControl(), travel = await h.travel.readRpgTravel(id);
  return { attemptId, operationId: id, control: current.control!, gameId: current.game!.id, deadlineAt: Date.now() + 120_000,
    action: action ?? { type: 'step' as const, sequence: travel!.travel.operation.nextStep } };
}

declare global { interface Window { rpgAgenticaEvents: typeof import('./rpg-agentica-events-fixture'); } }

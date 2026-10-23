import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import type { CanonicalHead } from '../types';
import { DEFAULT_QUOTA } from '../types';
import { emptyPrivateCapacity } from '../privateCapacity';
import { checkpointJson } from '../game/checkpoint';
import { knowledgeFixture } from '../knowledge/region.test-support';
export const protocolHead = (): CanonicalHead => ({ schema: 1, generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1, revision: 7,
  status: 'ready', roots: { world: null, knowledge: null, execution: null }, allocations: {},
  quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0, privateCapacity: emptyPrivateCapacity() }, checkpoint: checkpointJson(knowledgeFixture().checkpoint()) });
export const protocolAction = (revision = 7): AgenticaAction => ({ actionId: 'action', runId: 'run', runnerRunId: 'runner', stepId: 'step',
  sessionId: 'session', sessionEpoch: '1', capabilityId: 'maze.inspect', manifestHash: `sha256:${'a'.repeat(64)}`,
  arguments: { row: -5, column: -2 }, expectedRevision: revision, deadlineAt: '2026-10-13T23:00:00.000Z' });
export const protocolResult = (action = protocolAction()): AgenticaResult => ({ actionId: action.actionId, sessionId: action.sessionId,
  sessionEpoch: action.sessionEpoch, disposition: 'applied', beforeRevision: action.expectedRevision, afterRevision: action.expectedRevision,
  evidenceId: 'evidence', summary: 'Retained earned cell.', observation: { observationId: 'observation', revision: action.expectedRevision,
    observedAt: '2026-10-13T00:00:00.000Z', facts: [], data: { state: 'remembered', row: -5, column: -2 } } });

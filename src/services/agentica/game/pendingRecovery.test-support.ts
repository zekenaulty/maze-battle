import type { AgenticaAction, AgenticaResult } from '../contracts';
import { mazeCapabilities } from './capabilities';
import type { ActionBinding } from './actionContract';
import type { DecisionView } from './decisionState';

export const pendingAction: AgenticaAction = { actionId: 'pending', runId: 'successor', runnerRunId: 'runner', stepId: 'step',
  sessionId: 'session', sessionEpoch: '2', capabilityId: 'maze.inspect', manifestHash: `sha256:${'a'.repeat(64)}`,
  arguments: { scope: 'room' }, expectedRevision: 20, deadlineAt: '2026-10-17T10:00:00Z' };
export const parentAction = { ...pendingAction, actionId: 'parent', runId: 'original', sessionEpoch: '1', capabilityId: 'maze.navigate' };
export const binding: ActionBinding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publication', id: 'publication' } };
export const noEffect: AgenticaResult = { actionId: 'pending', sessionId: 'session', sessionEpoch: '2', disposition: 'unavailable',
  beforeRevision: 25, afterRevision: 25, evidenceId: `pregrant-unavailable:${'b'.repeat(64)}`, summary: 'Never granted.' };
export const cap = mazeCapabilities().find(c => c.id === 'maze.inspect')!;
export const decisionView = { head: { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 3, revision: 25 },
  value: { terminal: { bound: { start: { hostId: 'maze-battle', objectiveId: 'objective', capabilities: [cap] },
    launch: { binding: { endpoint: 'ws://127.0.0.1:5259/api/host?ignored=1#ignored' } } } } } } as unknown as DecisionView;

export function remoteEntry(pinned = false) {
  return { hostId: 'maze-battle', sessionId: 'session', sessionEpoch: '2', runId: 'successor', objectiveId: 'objective',
    request: structuredClone(pendingAction), capability: structuredClone(cap), requestHash: `sha256:${'c'.repeat(64)}`,
    capabilityHash: `sha256:${'d'.repeat(64)}`, reservedAt: '2026-10-17T09:00:00Z', updatedAt: '2026-10-17T09:00:00Z',
    result: pinned ? { ...noEffect, observation: null, operation: null, completion: null } : null,
    resultHash: pinned ? `sha256:${'e'.repeat(64)}` : null, recoveryRetention: pinned ? 'http' : 'reserved' };
}
export const reply = (duplicate = false) => ({ actionId: pendingAction.actionId, resolved: true, duplicate });
export const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

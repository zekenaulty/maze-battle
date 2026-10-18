import type { RecoveryCandidate } from '../../persistence/canonical/agentica/recovery';
import type { RecoveryInspection, RecoveryInventory } from './useAgenticaRecovery';

const digest = 'a'.repeat(64);
export const candidate: RecoveryCandidate = { operationId: `travel-${digest}`,
  original: { key: `agentica/actions/${digest}`, id: 'original-id' },
  binding: { grant: { key: 'grant-key', id: 'grant-id' }, publication: { key: 'publication-key', id: 'publication-id' } } };
export const inventory = (): RecoveryInventory => ({
  fence: { generation: 'generation', gameId: 'canonical-game', owner: 'owner', epoch: 1, revision: 5 },
  active: { launchId: 'root-launch', guardId: 'root-guard', state: 'admitted', grant: null }, selected: null, claimed: null,
  allocations: [{ operationId: candidate.operationId, state: 'admitted', navigation: candidate }],
  pendingRemoteActions: 'unknown', sessionClear: 'unknown', stats: { reads: 3, writes: 0, readBytes: 100, writeBytes: 0 } });
const destination = { schema: 1 as const, kind: 'known-destination' as const,
  target: { level: 1, cell: { spaceId: 'entry', row: 4, column: 5 } }, limits: { steps: 64, replans: 4, durationMs: 120_000 } };
export const detail: RecoveryInspection = {
  fence: { ...inventory().fence }, candidate: structuredClone(candidate), launchId: 'root-launch',
  action: { actionId: 'original-action', capabilityId: 'maze.navigate', runId: 'run', runnerRunId: 'runner', stepId: 'step',
    sessionId: 'session', sessionEpoch: '1', manifestHash: `sha256:${digest}`, expectedRevision: 1,
    arguments: { level: 1, spaceId: 'entry', row: 4, column: 5 }, deadlineAt: '2026-10-17T00:00:00.000Z' },
  result: { actionId: 'original-action', sessionId: 'session', sessionEpoch: '1', disposition: 'applied', beforeRevision: 1,
    afterRevision: 2, evidenceId: 'admission', summary: 'Navigation admitted.', operation: { operationId: candidate.operationId, summary: 'Retained navigation.' } },
  operation: { ...inventory().fence, schema: 1, id: candidate.operationId, binding: destination, state: 'admitted',
    admissionAttemptId: 'admission', terminalBytes: 131072, ackPolicy: 'verified-host', witness: 'operation-witness' },
  progress: { schema: 1, operationId: candidate.operationId, binding: destination, sourceAttemptId: 'progress',
    owner: 'owner', epoch: 1, status: 'running', sequence: 2, steps: 2, replans: 0, startedAt: 0, deadline: 120000,
    position: { level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } }, route: [], reason: null },
  terminal: null, acknowledgement: null, decision: null, claim: null,
  pendingRemoteActions: 'unknown', sessionClear: 'unknown', stats: { reads: 3, writes: 0, readBytes: 100, writeBytes: 0 },
};
export const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

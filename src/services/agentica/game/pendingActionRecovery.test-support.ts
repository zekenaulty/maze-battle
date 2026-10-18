import { vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import type { OwnerFence } from '../../../persistence/canonical/types';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import type { PendingActionDescriptor } from './pendingActionRecovery.types';
import { binding, cap, decisionView, noEffect, parentAction, pendingAction, remoteEntry, response } from './pendingRecovery.test-support';

export { createGamePendingRecovery, listGamePendingActions, inspectGamePendingAction, reconcileGamePendingAction } from './pendingActionRecovery';
export { noEffect, pendingAction, remoteEntry, response, reply } from './pendingRecovery.test-support';
export const fence = { ...decisionView.head } as OwnerFence;
export const candidate: RecoveryCandidate = { operationId: 'travel-original', original: { key: 'agentica/actions/original', id: 'original' }, binding };
export const run = { hostId: 'maze-battle', sessionId: 'session', sessionEpoch: '2', runId: 'successor' };
export const descriptor = (actionId = 'pending'): PendingActionDescriptor => ({ actionId, requestHash: remoteEntry().requestHash,
  capabilityHash: remoteEntry().capabilityHash, disposition: null, recoveryRetention: 'reserved' });
export const page = (items = [descriptor()], nextAfterActionId: string | null = null) => ({ ...run, items, nextAfterActionId });
export const claimed = () => ({ reference: { key: 'claim', id: 'claim' }, data: { started: { ...run, manifestHash: pendingAction.manifestHash } },
  source: { operation: 'retained' }, decision: { reference: { key: 'decision', id: 'decision' } } });
export const detail = () => ({ fence, candidate, action: structuredClone(parentAction), launchId: 'launch',
  claim: claimed(), decision: claimed().decision, terminal: { event: { kind: 'decision' } } });
export const view = () => ({ head: structuredClone(fence), value: { grant: null as unknown, claim: claimed(),
  terminal: { bound: { active: { id: 'launch', sourceAttemptId: 'admission' },
    start: { hostId: 'maze-battle', sessionId: 'session', objectiveId: 'objective', capabilities: [structuredClone(cap)] },
    launch: { binding: { endpoint: 'ws://127.0.0.1:5259/api/host?ignored=1#ignored', launchId: 'launch' },
      guard: { id: 'guard', admissionAttemptId: 'admission', terminal: { disposition: 'cancelled' } },
      run: { value: { data: { started: { runId: 'original' } } } } } } } } });
export const stop = () => ({ head: structuredClone(fence), value: { admissionAttemptId: 'admission', guardId: 'guard',
  terminal: { source: { attemptId: 'cancelled-root' } } } });
export const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
export function setup(m: Record<'database' | 'inspect' | 'decision' | 'stop' | 'proof' | 'sdk', ReturnType<typeof vi.fn>>) {
  vi.resetAllMocks();
  const state = { host: new AbortController(), scope: new AbortController(), schema: new AbortController() };
  const port = { owner: fence.owner, get hostSignal() { return state.host.signal; },
    submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn() } as unknown as GameSession;
  m.database.mockImplementation(async (input: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>) => {
    const signal = AbortSignal.any([input, state.schema.signal]); signal.throwIfAborted();
    const result = await work(signal); signal.throwIfAborted(); return result;
  });
  m.inspect.mockImplementation(async () => detail()); m.decision.mockImplementation(async () => view()); m.stop.mockImplementation(async () => stop());
  m.proof.mockImplementation(async () => structuredClone(noEffect));
  const http = vi.fn<typeof fetch>().mockImplementation(async () => response(page()));
  return { state, port, http, options: { signal: state.scope.signal, fetchImpl: http } };
}
export const clearance = { rootClear: 'unknown', sessionClear: 'unknown' } as const;

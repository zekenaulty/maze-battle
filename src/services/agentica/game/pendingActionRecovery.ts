import type { GameSession } from '../../game/GameSession';
import type { OwnerFence } from '../../../persistence/canonical/types';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { provePregrantNoEffect } from '../../../persistence/canonical/agentica/pregrant-proof';
import { equal, snapshotJson, validateAction } from '../../../persistence/canonical/agentica/validation';
import { check, fence } from '../../../persistence/canonical/validation';
import { boundedGameFetch } from './network';
import { recoverPregrantAction } from './pendingRecovery';
import { pendingRecoveryEntry, pendingRecoveryUrl, recoveryResponse } from './pendingRecovery.wire';
import { pendingRecoveryContext } from './pendingActionRecovery.context';
import { pendingClearance, pendingDescriptor, pendingPage, pendingRunUrl, selectedHashes } from './pendingActionRecovery.wire';
import type { GamePendingRecovery, PendingActionDescriptor, PendingActionSelection } from './pendingActionRecovery.types';
export type { GamePendingRecovery, PendingActionDescriptor, PendingActionPage, PendingActionSelection } from './pendingActionRecovery.types';

export interface PendingRecoveryOptions { signal?: AbortSignal; fetchImpl?: typeof fetch }
const selections = new WeakMap<PendingActionSelection, { port: GameSession; fence: OwnerFence;
  candidate: RecoveryCandidate; anchor: unknown; selection: PendingActionSelection }>();
const running = new WeakSet<GameSession>();

/** Local construction only. Each explicit operation holds the schema; no SDK, writes or automatic page/retry loop. */
export function createGamePendingRecovery(port: GameSession, inputFence: OwnerFence, input: RecoveryCandidate,
  options: PendingRecoveryOptions = {}): GamePendingRecovery {
  const expected = snapshotJson(inputFence), candidate = snapshotJson(input), hostSignal = port.hostSignal;
  const fetchImpl = options.fetchImpl;
  fence(expected);
  const closed = new AbortController(), lifetime = AbortSignal.any([hostSignal, closed.signal, ...(options.signal ? [options.signal] : [])]);
  let anchor: unknown;
  const alive = (signal: AbortSignal) => {
    signal.throwIfAborted(); check(port.hostSignal === hostSignal, 'pending recovery game lifetime changed');
    check(port.owner === expected.owner, 'pending recovery requires current game ownership');
  };
  async function run<T>(work: (context: Awaited<ReturnType<typeof pendingRecoveryContext>>,
    signal: AbortSignal, network: typeof fetch, current: () => Promise<unknown>) => Promise<T>): Promise<T> {
    alive(lifetime); check(!running.has(port), 'pending recovery is already running'); running.add(port);
    try {
      return await inRecoveryDatabase(lifetime, async signal => {
        const current = async () => {
          alive(signal);
          const found = await pendingRecoveryContext(expected, candidate, signal, () => alive(signal)); alive(signal);
          check(anchor === undefined || equal(anchor, found.anchor), 'pending recovery original custody changed');
          anchor ??= snapshotJson(found.anchor);
          return found;
        };
        const context = await current(), network = boundedGameFetch(signal, fetchImpl);
        const guarded: typeof fetch = async (url, init) => {
          await current(); const response = await network(url, init); await current(); return response;
        };
        const result = await work(context, signal, guarded, current); await current(); return result;
      });
    } finally { running.delete(port); }
  }
  return {
    close() { closed.abort(new Error('Pending recovery closed.')); },
    list(afterActionId = null) {
      return run(async ({ run, endpoint }, _signal, network) => {
        const response = await network(pendingRunUrl(endpoint, run, afterActionId), { method: 'GET', cache: 'no-store' });
        return pendingPage(await recoveryResponse(response), run, afterActionId);
      });
    },
    inspect(inputDescriptor) {
      const descriptor = pendingDescriptor(inputDescriptor);
      return run(async ({ identity, start, run, endpoint }, signal, network, current) => {
        const raw = await recoveryResponse(await network(pendingRecoveryUrl(endpoint, run.sessionId, descriptor.actionId),
          { method: 'GET', cache: 'no-store' }));
        selectedHashes(raw, descriptor);
        const action = validateAction((raw as Record<string, unknown>).request);
        check(action.actionId === descriptor.actionId, 'selected recovery action changed');
        const result = await provePregrantNoEffect(expected, identity, candidate.binding, action, { signal });
        await current(); const cap = start.capabilities.find(c => c.id === action.capabilityId);
        check(cap, 'missing original recovery capability');
        pendingRecoveryEntry(raw, action, start.objectiveId, cap, result);
        const selection: PendingActionSelection = { status: 'action-inspected', descriptor, action, result, ...pendingClearance };
        selections.set(selection, { port, fence: expected, candidate, anchor, selection: snapshotJson(selection) }); return selection;
      });
    },
    reconcile(selection) {
      return run(async ({ identity, anchor }, signal, network) => {
        const retained = selections.get(selection), saved = retained?.selection;
        check(retained?.port === port && equal(retained.fence, expected) && equal(retained.candidate, candidate)
          && equal(retained.anchor, anchor) && saved && equal(saved, selection), 'inspect the exact selected action for this recovery context');
        const guarded: typeof fetch = async (url, init) => {
          const response = await network(url, init);
          if (response.ok && init?.method === 'GET') selectedHashes(await response.clone().json(), saved.descriptor);
          return response;
        };
        const result = await recoverPregrantAction(port, identity.action, candidate.binding, saved.action,
          { signal, expectedFence: expected, fetchImpl: guarded });
        check(equal(result.result, saved.result), 'selected recovery proof changed'); return result;
      });
    },
  };
}

export async function listGamePendingActions(port: GameSession, fence: OwnerFence, candidate: RecoveryCandidate,
  options: PendingRecoveryOptions & { afterActionId?: string | null } = {}) {
  const recovery = createGamePendingRecovery(port, fence, candidate, options);
  try { return await recovery.list(options.afterActionId); } finally { recovery.close(); }
}
export async function inspectGamePendingAction(port: GameSession, fence: OwnerFence, candidate: RecoveryCandidate,
  descriptor: PendingActionDescriptor, options: PendingRecoveryOptions = {}) {
  const recovery = createGamePendingRecovery(port, fence, candidate, options);
  try { return await recovery.inspect(descriptor); } finally { recovery.close(); }
}
export async function reconcileGamePendingAction(port: GameSession, fence: OwnerFence, candidate: RecoveryCandidate,
  selection: PendingActionSelection, options: PendingRecoveryOptions = {}) {
  const recovery = createGamePendingRecovery(port, fence, candidate, options);
  try { return await recovery.reconcile(selection); } finally { recovery.close(); }
}

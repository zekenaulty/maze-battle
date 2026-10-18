import { AgenticaHost } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { inspectAgenticaRecovery, type RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { check, sameFence } from '../../../persistence/canonical/validation';
import { decisionCleanup } from './decisionCleanup';
import { boundedGameFetch } from './network';
import { createGameOperationDriver } from './operationDriver';

type RecoveryPort = CanonicalHostPort & CanonicalRecoveryPort & { readonly owner: string };
type RecoveryAction = 'stop' | 'reconcile';

/** Explicit historical cleanup of one inspected original. Never grants, moves, connects or wakes. */
export async function recoverGameNavigation(port: RecoveryPort, inputFence: OwnerFence, input: RecoveryCandidate,
  action: RecoveryAction, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) {
  const expected = structuredClone(inputFence), candidate = structuredClone(input), hostSignal = port.hostSignal;
  const lifetime = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]);
  lifetime.throwIfAborted(); check(action === 'stop' || action === 'reconcile', 'invalid navigation recovery action');
  check(port.owner === expected.owner, 'navigation recovery requires current game ownership');
  return inRecoveryDatabase(lifetime, async signal => {
    const alive = () => {
      signal.throwIfAborted(); check(port.hostSignal === hostSignal, 'navigation recovery lifetime changed');
    };
    const detail = await inspectAgenticaRecovery(expected, candidate, { signal }); alive();
    const initial = await readLaunch(detail.launchId); alive();
    check(sameFence(expected, initial.head) && initial.value, 'navigation recovery root changed');
    const launch = initial.value;
    if (action === 'reconcile') {
      check(detail.operation.terminal && detail.terminal, 'stop navigation before reconciliation');
      check(launch.guard.terminal?.disposition === 'cancelled', 'stop the root session before navigation reconciliation');
    }
    const current = async () => {
      alive(); const view = await readLaunch(detail.launchId); alive();
      check((['generation', 'gameId', 'owner', 'epoch'] as const).every(key => view.head[key] === expected[key])
        && view.value?.guard.admissionAttemptId === launch.guard.admissionAttemptId, 'navigation recovery custody changed');
    };
    const network = boundedGameFetch(signal, options.fetchImpl);
    const fetchBound: typeof fetch = async (url, init) => {
      check(action === 'reconcile', 'local navigation Stop cannot contact the service');
      await current(); const response = await network(url, init); await current(); return response;
    };
    const forbidden = async () => { throw new Error('Navigation recovery cannot execute actions.'); };
    const guarded: RecoveryPort = {
      owner: port.owner, get hostSignal() { return port.hostSignal; }, submitHostCommand: forbidden,
      async cleanupHostOperation(command, signal) {
        await current(); const result = await port.cleanupHostOperation(command, signal); await current(); return result;
      },
    };
    // HTTP-only SDK methods reuse the established protocol. No connect/start/action hooks are permitted.
    const sdk = new AgenticaHost({ url: launch.binding.endpoint, onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
    let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
    const close = () => { driver?.close(); sdk.close(); };
    signal.addEventListener('abort', close, { once: true });
    try {
      alive();
      if (action === 'reconcile' && detail.decision && (detail.claim || launch.guard.state === 'acknowledged')
        && detail.terminal?.event.kind === 'decision') {
        const identity = await prepareAction(detail.action); alive();
        const cleanup = decisionCleanup(guarded, identity, candidate.binding, sdk, fetchBound, signal, hostSignal);
        const result = await cleanup.acknowledge(); alive(); return result;
      }
      driver = await createGameOperationDriver(guarded, sdk, detail.action, candidate.binding, fetchBound); alive();
      if (action === 'stop') {
        await driver.cancel(); alive(); return { status: 'navigation-stopped' as const };
      }
      // The inspected terminal is immutable. The guarded port rejects ordinary commands as a second barrier.
      const result = await driver.pulse(); alive(); return result;
    } finally { signal.removeEventListener('abort', close); close(); }
  });
}

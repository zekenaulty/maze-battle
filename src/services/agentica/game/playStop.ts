import type { GameSession } from '../../game/GameSession';
import { readCanonical } from '../../../persistence/canonical/read';
import { launchGuardId, readLaunch } from '../../../persistence/canonical/agentica/launch';
import { inspectAgenticaRecovery, listAgenticaRecovery } from '../../../persistence/canonical/agentica/recovery';
import { check } from '../../../persistence/canonical/validation';
import { createGrantedLaunchRecovery, createLaunchRecovery } from './launchRecovery';

/** Caller has withdrawn all live channels first. Cancel locally before any remote reconciliation. */
export async function stopGamePlay(session: GameSession, launchId: string, signal: AbortSignal) {
  await session.flush(); signal.throwIfAborted();
  const { head, value: guard } = await readCanonical(p => p.liveOperation(launchGuardId(launchId)));
  signal.throwIfAborted(); check(session.hostSignal === signal && head.owner === session.owner, 'Agentic play ownership changed.');
  if (!guard) return 'No launch was admitted.';
  if (!guard.terminal) await session.cleanupHostOperation({ kind: 'cancel', target: {
    generation: head.generation, gameId: head.gameId, operationId: guard.id,
  } }, signal);
  // A navigation admission may have committed just before its action callback was withdrawn.
  const inventory = await listAgenticaRecovery({ signal });
  for (const row of inventory.allocations) {
    if (!row.navigation) continue;
    const current = await listAgenticaRecovery({ signal });
    const detail = await inspectAgenticaRecovery(current.fence, row.navigation, { signal });
    if (detail.launchId !== launchId || detail.operation.terminal) continue;
    await session.cleanupHostOperation({ kind: 'cancel', target: {
      generation: current.fence.generation, gameId: current.fence.gameId, operationId: detail.operation.id,
    } }, signal);
  }
  signal.throwIfAborted();
  const launch = (await readLaunch(launchId)).value!;
  signal.throwIfAborted(); check(session.hostSignal === signal, 'Agentic play ownership changed.');
  const recovery = await (launch.grant ? createGrantedLaunchRecovery : createLaunchRecovery)(session, launchId);
  try {
    const result = await recovery.stop(); signal.throwIfAborted();
    return result.status === 'settled' ? 'Local play stopped. Root acknowledged; other recovery may remain.'
      : 'Local play stopped. Service reconciliation remains pending.';
  } finally { recovery.close(); }
}

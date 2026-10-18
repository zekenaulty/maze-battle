import { readCanonical } from '../read';
import { canonicalFence } from '../transaction';
import { MAX_RESERVATIONS } from '../types';
import { check, sameFence } from '../validation';
import { loadLaunch } from './launch.read';
import { recoveryOriginal, recoveryPointers } from './recovery.records';
import type { RecoveryAllocation, RecoveryInventory } from './recovery.types';
import { inRecoveryDatabase } from './recovery.database';

export type { RecoveryCandidate, RecoveryInventory } from './recovery.types';
export { inspectAgenticaRecovery } from './recovery.inspect';

/** Local allocations, selected predecessor and last claimed parent. No history scan, remote lookup or implicit choice. */
export async function listAgenticaRecovery(options: { signal?: AbortSignal } = {}) {
  return inRecoveryDatabase(options.signal, inventory);
}

async function inventory(signal: AbortSignal) {
  const before = await readCanonical(async () => undefined, { signal }), expected = canonicalFence(before.head);
  const ids = Object.keys(before.head.allocations).sort();
  check(ids.length <= MAX_RESERVATIONS, 'unbounded recovery allocations');
  const view = await readCanonical(async pages => {
    const pointers = await recoveryPointers(pages), allocations: RecoveryAllocation[] = [];
    for (const operationId of ids) {
      const operation = await pages.liveOperation(operationId);
      check(operation && operation.state !== 'acknowledged', 'recovery allocation changed');
      let navigation: RecoveryAllocation['navigation'] = null;
      if (/^(travel|interact)-[a-f0-9]{64}$/.test(operationId)) {
        const key = `agentica/actions/${operationId.slice(-64)}`, row = await pages.get('execution', key);
        check(row && operation.ackPolicy === 'verified-host', 'missing original funded recovery action');
        navigation = (await recoveryOriginal(pages, { key, id: row.id })).candidate;
        check(navigation.operationId === operationId, 'recovery operation capability changed');
      } else if (operationId.startsWith('agentica-launch:')) {
        check(pointers.active, 'missing active funded launch');
        await loadLaunch(pages, operationId.slice('agentica-launch:'.length));
      }
      allocations.push({ operationId, state: operation.state, navigation });
    }
    return { fence: expected, ...pointers, allocations, pendingRemoteActions: 'unknown', sessionClear: 'unknown' } satisfies RecoveryInventory;
  }, { signal });
  check(sameFence(expected, view.head), 'recovery inventory fence changed');
  return { ...view.value, stats: { ...view.stats, reads: before.stats.reads + view.stats.reads,
    readBytes: before.stats.readBytes + view.stats.readBytes } };
}

import type { GameSession } from '../../src/services/game/GameSession';
import { recoverGameNavigation } from '../../src/services/agentica/game/navigationRecovery';
import { listAgenticaRecovery } from '../../src/persistence/canonical/agentica/recovery';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { loadOperationBinding } from '../../src/persistence/canonical/agentica/operation.binding';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { retainedNavigation } from './canonical-start-service.retained-navigation';

/** Historical cleanup only: no socket connection, transfer or action execution. */
export async function attachNavigationCleanup(session: GameSession, reference: ProtocolRef) {
  const { identity, binding } = await retainedNavigation(reference);
  const abort = new AbortController();
  async function recover(action: 'stop' | 'reconcile') {
    const inventory = await listAgenticaRecovery({ signal: abort.signal });
    const candidates = inventory.allocations.flatMap(row => row.navigation ? [row.navigation] : []);
    if (inventory.selected?.predecessor) candidates.push(inventory.selected.predecessor);
    const candidate = candidates.find(row => row.original.id === reference.id && row.original.key === reference.key);
    if (!candidate) throw Error('Original is no longer in the bounded local recovery inventory');
    return recoverGameNavigation(session, inventory.fence, candidate, action, { signal: abort.signal });
  }
  let cancelled = false;
  return {
    async cancel() { await recover('stop'); cancelled = true; },
    async pulse() {
      if (!cancelled) throw Error('Explicit local cancellation required before historical delivery');
      return recover('reconcile');
    },
    async read() {
      const { value: bound, head } = await readCanonical(pages => loadOperationBinding(pages, identity, binding));
      return { head, binding, original: bound.original, operation: bound.operation, progress: bound.progress,
        terminal: (await readAgenticaTerminal(identity, binding)).value };
    },
    close() { abort.abort(); },
  };
}

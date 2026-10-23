import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { operateCanonical } from '../../src/persistence/canonical/transaction';
import { command, current, refusal } from './canonical-private-capacity.support';

/** Native transaction fault, not a raw-accounting mode or a domain writer. */
export async function rootOnlyCleanupFault() {
  const head = await current(), original = CanonicalPages.prototype.prepare;
  const calls: { records: number; nodes: number; snapshot: boolean; oldWorld: string | null; nextWorld: null }[] = [];
  CanonicalPages.prototype.prepare = async function() {
    const staged = await original.call(this);
    calls.push({ records: staged.records.length, nodes: staged.nodes.length, snapshot: !!staged.snapshot,
      oldWorld: staged.roots.world, nextWorld: null });
    return { ...staged, roots: { ...staged.roots, world: null } };
  };
  try {
    const result = await refusal(() => operateCanonical(command(head, 'operation.cancel', { operationId: 'funded-original' }), 'cancel'));
    return { calls, result };
  } finally { CanonicalPages.prototype.prepare = original; }
}

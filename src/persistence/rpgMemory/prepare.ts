import { integer, validId } from '../../domain/agentic/knowledge/shared';
import { getDatabase } from '../saveRepository';
import { ancestorAt, observationReader, requireSuccessor } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { MemoryTree } from './tree';
import { memoryBudget } from './budget';
import { memoryHeadWitness, validateMemoryHead } from './heads';
import { deriveRpgMemory } from './derive';
import { requireMemory, type MemoryWork, type RpgMemoryHead } from './types';

/** Derived cache only. Bounded backfill never rewrites a save, source or control revision. */
export async function prepareRpgMemory(slotId = 'auto', input: MemoryWork & { maxSources?: number; snapshotId?: string } = {}) {
  const maxSources = input.maxSources ?? 4, budget = memoryBudget(input), snapshotId = input.snapshotId;
  requireMemory(validId(slotId) && integer(maxSources, 1, 16) && (snapshotId === undefined || validId(snapshotId)));
  budget.check();
  const db = await getDatabase(), tx = db.transaction(['saves', 'observations', 'rpgMemoryNodes', 'rpgMemoryHeads'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    budget.read();
    const slot = await tx.objectStore('saves').get(slotId);
    requireMemory(slot && (snapshotId === undefined || slot.observationHead === snapshotId));
    if (slot.observationHead === undefined) { await tx.done; return { status: 'unprepared' as const, reason: 'no-observation' as const, work: budget.stats() }; }
    const reader = observationReader({ get(id) { budget.read(); return tx.objectStore('observations').get(id); } }, slot.game.id);
    const head = await reader.read(slot.observationHead), roots = new Map<string, RpgMemoryHead | undefined>();
    const cached = async (node: RpgObservationNode) => {
      if (!roots.has(node.id)) {
        budget.read();
        const stored = await tx.objectStore('rpgMemoryHeads').get(node.id);
        roots.set(node.id, stored === undefined ? undefined : validateMemoryHead(stored, node));
      }
      return roots.get(node.id);
    };
    let last = await cached(head), preparedDepth = last?.depth ?? 0;
    if (!last) {
      // Committed derived heads form a prefix on each immutable source branch.
      let low = 0, high = head.depth - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (await cached(await ancestorAt(reader, head, middle))) low = middle;
        else high = middle - 1;
      }
      preparedDepth = low;
      if (low) last = await cached(await ancestorAt(reader, head, low));
    }
    const end = Math.min(head.depth, preparedDepth + maxSources);
    for (let depth = preparedDepth + 1; depth <= end; depth++) {
      budget.check();
      const node = await ancestorAt(reader, head, depth);
      if (depth > 1) requireSuccessor(await ancestorAt(reader, head, depth - 1), node);
      const existing = await cached(node);
      if (existing) { last = existing; preparedDepth = depth; continue; }
      const tree = new MemoryTree(tx.objectStore('rpgMemoryNodes'), last?.root ?? null, budget);
      const cellCount = await deriveRpgMemory(tree, reader, node, last?.cellCount ?? 0);
      const index = { id: node.id, gameId: node.gameId, depth, root: await tree.flush(), cellCount };
      last = { ...index, witness: memoryHeadWitness(index) };
      validateMemoryHead(last, node);
      budget.write();
      await tx.objectStore('rpgMemoryHeads').add(last);
      preparedDepth = depth;
    }
    budget.check();
    await tx.done;
    return { status: preparedDepth === head.depth ? 'ready' as const : 'partial' as const,
      snapshotId: head.id, preparedDepth, targetDepth: head.depth, work: budget.stats() };
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

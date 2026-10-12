import { freeze, validId } from '../../domain/agentic/knowledge/shared';
import { getDatabase } from '../saveRepository';
import { observationReader } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { MemoryTree } from './tree';
import { memoryBudget } from './budget';
import { validateMemoryHead } from './heads';
import { memoryWitnesses } from './witnesses';
import { requireMemory, type MemoryWork, type UnpreparedMemory } from './types';

export interface MemoryQuery {
  tree: MemoryTree;
  head: RpgObservationNode;
  cell: ReturnType<typeof memoryWitnesses>;
}
export interface ReadyMemory<T> { status: 'ready'; snapshotId: string; data: T; work: { reads: number; writes: number } }

export async function queryRpgMemory<T>(slotId: string, snapshotId: string | undefined, input: MemoryWork,
  action: (query: MemoryQuery) => Promise<T>): Promise<ReadyMemory<T> | UnpreparedMemory> {
  requireMemory(validId(slotId) && (snapshotId === undefined || validId(snapshotId)));
  const budget = memoryBudget(input); budget.check();
  const db = await getDatabase(), tx = db.transaction(['saves', 'observations', 'rpgMemoryNodes', 'rpgMemoryHeads'], 'readonly');
  void tx.done.catch(() => {});
  const unwatch = budget.watch(tx);
  try {
    budget.read();
    const slot = await tx.objectStore('saves').get(slotId);
    requireMemory(slot && (snapshotId === undefined || slot.observationHead === snapshotId));
    if (slot.observationHead === undefined) { budget.check(); await tx.done; budget.check(); return { status: 'unprepared', reason: 'no-observation' }; }
    const reader = observationReader({ get(id) { budget.read(); return tx.objectStore('observations').get(id); } }, slot.game.id);
    const head = await reader.read(slot.observationHead);
    budget.read();
    const stored = await tx.objectStore('rpgMemoryHeads').get(head.id);
    if (!stored) { budget.check(); await tx.done; budget.check(); return { status: 'unprepared', reason: 'index-incomplete', snapshotId: head.id }; }
    const index = validateMemoryHead(stored, head);
    const tree = new MemoryTree({ get: id => tx.objectStore('rpgMemoryNodes').get(id), add: async () => { throw new Error('Read only memory query.'); } }, index.root, budget);
    const data = await action({ tree, head, cell: memoryWitnesses(reader, head) });
    budget.check();
    await tx.done;
    budget.check();
    return freeze(structuredClone({ status: 'ready', snapshotId: head.id, data, work: budget.stats() }));
  } catch (error) { try { tx.abort(); } catch { /* Already completed. */ } throw error; }
  finally { unwatch(); }
}

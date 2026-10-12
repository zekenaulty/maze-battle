import { observationReader } from '../observationNodes';
import type { GameWrite } from '../gameTransaction';
import type { SaveSlot } from '../../domain/types';
import { memoryBudget } from './budget';
import { validateMemoryHead } from './heads';
import { MemoryTree } from './tree';
import { memoryWitnesses } from './witnesses';
import type { MemoryQuery } from './query';

/** Reads the exact game snapshot within the caller's write, never starts a nested transaction. */
export async function memoryInGameTransaction(tx: GameWrite, slot: SaveSlot,
  budget: ReturnType<typeof memoryBudget>): Promise<MemoryQuery | undefined> {
  if (!slot.observationHead) return;
  const reader = observationReader({ get(id) { budget.read(); return tx.objectStore('observations').get(id); } }, slot.game.id);
  const head = await reader.read(slot.observationHead);
  budget.read();
  const stored = await tx.objectStore('rpgMemoryHeads').get(head.id);
  if (!stored) return;
  const index = validateMemoryHead(stored, head);
  return { head, cell: memoryWitnesses(reader, head), tree: new MemoryTree({
    get: id => tx.objectStore('rpgMemoryNodes').get(id),
    add: async () => { throw new Error('Travel may not modify remembered facts.'); },
  }, index.root, budget) };
}

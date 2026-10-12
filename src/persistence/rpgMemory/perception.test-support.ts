import { vi } from 'vitest';
import type { RpgObservation } from '../../domain/agentic/knowledge/types';
import { ancestorIndex, observationLineage, observationReader } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { memoryBudget } from './budget';
import { deriveRpgMemory } from './derive';
import { MemoryTree, type MemoryNode } from './tree';
import type { MemoryQuery } from './query';
import type { MemoryWork } from './types';
import { memoryWitnesses } from './witnesses';

export function sight(columns: number[], revision: number, floor = 1): RpgObservation {
  const at = (column: number) => ({ floor, row: 0, column });
  return { version: 1, status: 'observed', id: `sight-${revision}`, gameId: 'perception-game',
    revision: { owner: 'owner', epoch: 1, revision }, observedAt: '2026-10-12T00:00:00Z',
    actor: at(columns[0]), policy: { kind: 'rpg-linked-bfs-v1', radius: columns.length - 1 },
    cells: columns.map(column => ({ address: at(column), roomIds: ['hall'], stairs: column === 0 ? ['town'] : [],
      chests: column === 2 ? [{ id: 'chest', position: at(column), opened: false }] : [],
      blocked: ['north', 'south'], links: [
        ...(columns.includes(column - 1) ? ['west' as const] : []),
        ...(columns.includes(column + 1) ? ['east' as const] : []),
      ] })) };
}

export async function perceptionArchive(receipts: RpgObservation[]) {
  const nodes = new Map<string, MemoryNode>(), sources = new Map<string, RpgObservationNode>();
  const store = { async get(id: string) { return structuredClone(nodes.get(id)); },
    async add(node: MemoryNode) { nodes.set(node.id, structuredClone(node)); } };
  const reader = observationReader({ async get(id) { return sources.get(id); } }, receipts[0].gameId);
  const tree = new MemoryTree(store, null, memoryBudget({ maxReads: 65536, maxWrites: 65536 }));
  const snapshots: { head: RpgObservationNode; root: string | null }[] = [];
  let count = 0;
  for (const observation of receipts) {
    const metadata = { id: observation.id, gameId: observation.gameId, depth: snapshots.length + 1,
      ancestors: await ancestorIndex(reader, snapshots.at(-1)?.head) };
    sources.set(observation.id, { ...metadata, version: 1, observation, lineage: observationLineage(metadata) });
    const head = await reader.read(observation.id);
    count = await deriveRpgMemory(tree, reader, head, count);
    snapshots.push({ head, root: await tree.flush() });
  }
  return { nodes, sources, open(index = snapshots.length - 1, work: MemoryWork = {}) {
    const { head, root } = snapshots[index], budget = memoryBudget(work), reads: string[] = [];
    const reader = observationReader({ async get(id) { budget.read(); reads.push(id); return sources.get(id); } }, head.gameId);
    const tree = new MemoryTree({ ...store, async add() { throw new Error('Read only'); } }, root, budget);
    vi.spyOn(tree, 'scan').mockRejectedValue(new Error('Unbounded scan'));
    const get = vi.spyOn(tree, 'get');
    const query: MemoryQuery = { tree, head, cell: memoryWitnesses(reader, head) };
    return { query, get, budget, reads };
  } };
}

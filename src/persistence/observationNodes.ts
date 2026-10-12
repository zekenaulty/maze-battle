import { validateRpgObservation } from '../domain/agentic/knowledge/validateObservation';
import { integer, validId } from '../domain/agentic/knowledge/shared';
import type { RpgObservationNode } from './observationTypes';

type Store = { get(id: string): Promise<RpgObservationNode | undefined> };
export function requireHistory(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or unavailable observation history. Existing evidence was preserved.');
}

export function validateObservationNode(value: unknown, id: string, gameId: string): RpgObservationNode {
  const node = value as RpgObservationNode | undefined;
  requireHistory(node && Object.keys(node).sort().join(',') === 'ancestors,depth,gameId,id,observation,version');
  requireHistory(node.version === 1 && node.id === id && validId(id) && node.gameId === gameId && integer(node.depth, 1));
  const count = node.depth === 1 ? 0 : Math.floor(Math.log2(node.depth - 1)) + 1;
  requireHistory(Array.isArray(node.ancestors) && node.ancestors.length === count
    && node.ancestors.every(a => validId(a) && a !== id) && new Set(node.ancestors).size === count);
  const observation = validateRpgObservation(node.observation);
  requireHistory(observation.id === id && observation.gameId === gameId);
  return { ...node, ancestors: [...node.ancestors], observation };
}

export function observationReader(store: Store, gameId: string) {
  const cache = new Map<string, RpgObservationNode>();
  let reads = 0;
  const read = async (id: string, depth?: number): Promise<RpgObservationNode> => {
    requireHistory(validId(id));
    let node = cache.get(id);
    if (!node) {
      reads++;
      node = validateObservationNode(await store.get(id), id, gameId);
      cache.set(id, node);
    }
    requireHistory(depth === undefined || node.depth === depth);
    return node;
  };
  return { read, count: () => reads };
}

export type ObservationReader = ReturnType<typeof observationReader>;

export function requireSuccessor(parent: RpgObservationNode, child: RpgObservationNode) {
  const a = parent.observation, b = child.observation;
  requireHistory(parent.gameId === child.gameId && parent.depth + 1 === child.depth && child.ancestors[0] === parent.id
    && b.revision.epoch >= a.revision.epoch && b.revision.revision >= a.revision.revision
    && (b.revision.epoch !== a.revision.epoch || b.revision.owner === a.revision.owner)
    && Date.parse(b.observedAt) >= Date.parse(a.observedAt));
}

export async function ancestorAt(reader: ObservationReader, head: RpgObservationNode, depth: number) {
  requireHistory(integer(depth, 1, head.depth));
  let node = head;
  while (node.depth > depth) {
    const jump = Math.floor(Math.log2(node.depth - depth));
    node = await reader.read(node.ancestors[jump], node.depth - 2 ** jump);
  }
  return node;
}

export async function ancestorIndex(reader: ObservationReader, parent?: RpgObservationNode): Promise<string[]> {
  if (!parent) return [];
  const ancestors = [parent.id], depth = parent.depth + 1;
  requireHistory(Number.isSafeInteger(depth));
  for (let jump = 1; 2 ** jump < depth; jump++) {
    const mid = await reader.read(ancestors[jump - 1], depth - 2 ** (jump - 1));
    requireHistory(validId(mid.ancestors[jump - 1]));
    ancestors.push(mid.ancestors[jump - 1]);
  }
  return ancestors;
}

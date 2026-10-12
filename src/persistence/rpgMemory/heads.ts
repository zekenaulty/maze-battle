import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { integer, validId } from '../../domain/agentic/knowledge/shared';
import type { RpgObservationNode } from '../observationTypes';
import type { RpgMemoryHead } from './types';
import { requireMemory } from './types';

export const memoryHeadWitness = ({ id, gameId, depth, root, cellCount }: Omit<RpgMemoryHead, 'witness'>) =>
  canonicalJson({ id, gameId, depth, root, cellCount });

export function validateMemoryHead(value: unknown, source: RpgObservationNode): RpgMemoryHead {
  const head = value as RpgMemoryHead | undefined;
  requireMemory(head && Object.keys(head).sort().join(',') === 'cellCount,depth,gameId,id,root,witness');
  requireMemory(head.id === source.id && head.gameId === source.gameId && head.depth === source.depth
    && integer(head.cellCount, 1) && typeof head.root === 'string' && validId(head.root)
    && head.witness === memoryHeadWitness(head));
  return head;
}

import type { CellAddress } from '../domain/expedition/types';
import type { KnowledgeProjection, PresentedContext } from '../domain/directed/types';

type ContextEntry<T> = { value: T; observationId: string; observedAt: number; status: 'current' | 'remembered' };
export function directedViewModel(context: PresentedContext) {
  const data: { position: CellAddress; worldId: string; observerId: string; knowledgeRevision: number;
    cells: ContextEntry<KnowledgeProjection['cells'][string]['value']>[];
    spaces: ContextEntry<KnowledgeProjection['spaces'][string]['value']>[];
    features: ContextEntry<KnowledgeProjection['features'][string]['value']>[];
  } = JSON.parse(context.json);
  return { ...data, bytes: context.bytes };
}
export type DirectedViewModel = ReturnType<typeof directedViewModel>;

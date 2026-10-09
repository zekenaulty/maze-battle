import type { CellAddress } from '../domain/expedition/types';
import type { KnowledgeProjection, PresentedContext } from '../domain/directed/types';
import { sameAddress } from '../domain/expedition/address';

type ContextEntry<T> = { value: T; observationId: string; observedAt: number; status: 'current' | 'remembered' };
export function directedViewModel(context: PresentedContext) {
  const data: { position: CellAddress; worldId: string; observerId: string; knowledgeRevision: number;
    cells: ContextEntry<KnowledgeProjection['cells'][string]['value']>[];
    spaces: ContextEntry<KnowledgeProjection['spaces'][string]['value']>[];
    features: ContextEntry<KnowledgeProjection['features'][string]['value']>[];
  } = JSON.parse(context.json);
  const here = data.cells.find(entry => sameAddress(entry.value.address, data.position));
  const interactable = data.features.filter(({ value, status }) => status === 'current'
    && (value.kind === 'lever' && value.state === 'idle' || value.kind === 'chest' && value.state === 'closed')
    && (sameAddress(value.position, data.position) || Object.values(here?.value.exits ?? {}).some(to => sameAddress(to, value.position))))
    .map(entry => entry.value.id);
  return { ...data, bytes: context.bytes, interactable };
}
export type DirectedViewModel = ReturnType<typeof directedViewModel>;

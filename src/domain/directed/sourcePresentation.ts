import { presentObservationSources, type ObservationSourceIdentity } from './sourceContext';
import type { SourceContextSelection } from './contextSelection';
import type { ObservationReceipt, PresentedContext } from './types';

export function presentSourceContext(identity: ObservationSourceIdentity, knowledgeRevision: number,
  id: string, purpose: PresentedContext['purpose'], selection: SourceContextSelection,
  sources: ObservationReceipt[]): PresentedContext {
  const packet = presentObservationSources(identity, knowledgeRevision, selection.sourceIds, sources);
  return { id, observerId: identity.observerId, knowledgeRevision, purpose, selection: structuredClone(selection), ...packet };
}

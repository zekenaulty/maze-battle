import { check } from '../validation';
import { KNOWLEDGE_PREFIX } from './keys';
import { knowledgeAnchor } from './validation';
import { readCompleteObservation } from './observation.source';
import type { KnowledgeAnchor, KnowledgeRead } from './types';

export { readCompleteObservation as loadObservation, selectiveSourceReader as sourceReader } from './observation.source';

export async function validateKnowledge(pages: KnowledgeRead, input: KnowledgeAnchor | null) {
  knowledgeAnchor(input); const anchor = structuredClone(input);
  const actual = await pages.witness('knowledge', KNOWLEDGE_PREFIX);
  check(anchor ? actual === anchor.witness : actual === null, 'knowledge namespace differs from checkpoint');
  if (anchor) await readCompleteObservation(pages, { sequence: anchor.sequence, id: anchor.id });
}

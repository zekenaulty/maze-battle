import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { json } from '../world/records';
import { loadObservation } from './evidence';
import { observationRef } from './validation';
import type { KnowledgeRead, ObservationRef } from './types';
import { retainWorldIndexEvidence, validateWorldIndexEvidence } from './worldIndex.evidence';
import { GRAPH_KEY } from './graph.records';

export async function graphRecord(pages: KnowledgeRead, key: string) {
  const row = await pages.get('knowledge', key);
  await validateWorldIndexEvidence(pages, key, row);
  return row;
}
export async function storeGraph(pages: CanonicalPages, key: string, value: unknown) {
  const row = await pages.set('knowledge', key, json(value));
  await retainWorldIndexEvidence(pages, key, row);
}

/** Old history is unavailable; loss of a marker promised by an observation is corruption. */
export async function graphAvailable(pages: KnowledgeRead, reference: ObservationRef | null): Promise<boolean> {
  const row = await graphRecord(pages, GRAPH_KEY);
  if (!reference) { check(!row, 'graph marker exists without observation'); return false; }
  const current = await loadObservation(pages, { sequence: reference.sequence, id: reference.id });
  if (current.header.graph !== 'available') {
    check(!row, 'graph marker contradicts observation availability'); return false;
  }
  check(row, 'missing earned graph marker');
  const marker = fields(row.value, 'schema policy origin'); observationRef(marker.origin);
  check(marker.schema === 1 && marker.policy === 'earned-spaces-v1' && marker.origin.sequence === 1, 'invalid earned graph marker');
  const first = await loadObservation(pages, marker.origin);
  check(first.header.graph === 'available' && first.header.spaces, 'graph origin has no classification evidence');
  return true;
}

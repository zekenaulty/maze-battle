import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import type { CanonicalRecord } from '../types';
import { check, integer, validId } from '../validation';
import { json } from '../world/records';
import type { KnowledgeRead } from './types';
import { worldIndexDigest } from './worldIndex.evidence';

export const memoryIntegrityKey = (key: string) => `${key}/integrity`;

/** The immutable namespace binds this pair; the digest covers accumulated facts,
 * including edges whose original receipt has no other surviving reference. */
export async function validateMemoryIntegrity(pages: KnowledgeRead, key: string, block: CanonicalRecord | undefined) {
  const proof = await pages.get('knowledge', memoryIntegrityKey(key));
  if (!block && !proof) return;
  check(block && proof, 'missing memory integrity proof or block');
  const value = fields(proof.value, 'schema recordId revision digest');
  check(block.area === 'knowledge' && block.key === key && proof.area === 'knowledge' && proof.key === memoryIntegrityKey(key)
    && proof.generation === block.generation && proof.gameId === block.gameId
    && value.schema === 1 && validId(value.recordId) && integer(value.revision, 1) && typeof value.digest === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(value.digest) && value.recordId === block.id
    && value.revision === block.revision && proof.revision === block.revision
    && value.digest === worldIndexDigest(block.value), 'memory integrity proof changed');
}

/** Immediately follows the changed block write within the same canonical transaction. */
export async function retainMemoryIntegrity(pages: CanonicalPages, key: string, block: CanonicalRecord) {
  await pages.set('knowledge', memoryIntegrityKey(key), json({ schema: 1, recordId: block.id,
    revision: block.revision, digest: worldIndexDigest(block.value) }));
}

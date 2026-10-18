import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import type { CanonicalRecord } from '../types';
import { check, integer, validId } from '../validation';
import { json } from '../world/records';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { KnowledgeRead } from './types';

export const worldIndexEvidenceKey = (key: string) => `${key}/integrity`;
// Synchronous: never suspend an IndexedDB transaction on WebCrypto work.
export const worldIndexDigest = (value: CanonicalRecord['value']) =>
  `sha256:${bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))))}`;

/** Complete block contents, not only the surviving members. The checkpoint namespace binds
 * the two immutable record identities; neither member may be silently omitted or repaired.
 */
export async function validateWorldIndexEvidence(pages: KnowledgeRead, key: string, block: CanonicalRecord | undefined) {
  const proof = await pages.get('knowledge', worldIndexEvidenceKey(key));
  if (!block && !proof) return;
  check(block && proof, 'missing spatial index integrity evidence or block');
  const value = fields(proof.value, 'schema recordId revision digest');
  check(value.schema === 1 && validId(value.recordId) && integer(value.revision, 1) && typeof value.digest === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(value.digest)
    && value.recordId === block.id && value.revision === block.revision && proof.revision === block.revision
    && value.digest === worldIndexDigest(block.value), 'spatial index integrity evidence changed');
}

/** Called immediately after the block write in the same canonical transaction. */
export async function retainWorldIndexEvidence(pages: CanonicalPages, key: string, block: CanonicalRecord) {
  await pages.set('knowledge', worldIndexEvidenceKey(key), json({ schema: 1, recordId: block.id,
    revision: block.revision, digest: worldIndexDigest(block.value) }));
}

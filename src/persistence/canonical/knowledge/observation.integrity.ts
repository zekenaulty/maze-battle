import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import type { CanonicalRecord } from '../types';
import { check, jsonBytes } from '../validation';
import { json } from '../world/records';
import { observationKey } from './keys';
import { observationHeader } from './validation';
import { observationChunkRecord, observationCoverage, observationHeaderRecord, observationRecord } from './observation.validation';
import type { KnowledgeRead } from './types';

export const MAX_OBSERVATION_PROOF_BYTES = 1024;
export const observationIntegrityKey = (sequence: number) => `${observationKey(sequence)}/integrity`;
// Synchronous hashing keeps native IndexedDB transactions alive. Commit the entire record envelope.
export const observationDigest = (row: CanonicalRecord) => {
  jsonBytes(row);
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(canonicalJson(row))))}`;
};

export async function readObservationIntegrity(pages: KnowledgeRead, parentInput: CanonicalRecord) {
  jsonBytes(parentInput);
  const parent = structuredClone(parentInput), header = observationHeader(parent.value);
  observationHeaderRecord(parent, { sequence: header.sequence, id: parent.id });
  const row = await pages.get('knowledge', observationIntegrityKey(header.sequence));
  observationRecord(row, observationIntegrityKey(header.sequence), parent);
  jsonBytes(row.value, MAX_OBSERVATION_PROOF_BYTES);
  const proof = fields(row.value, 'schema recordId revision headerDigest chunkDigests');
  const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
  check(proof.schema === 1 && proof.recordId === parent.id && proof.revision === parent.revision
    && row.revision === parent.revision && digest(proof.headerDigest) && proof.headerDigest === observationDigest(parent)
    && Array.isArray(proof.chunkDigests) && proof.chunkDigests.length === header.chunks.length
    && proof.chunkDigests.every(digest), 'observation integrity evidence changed');
  return proof.chunkDigests as string[];
}

/** No repair/backfill: only a newly written, fully validated observation may acquire its proof. */
export async function retainObservationIntegrity(pages: CanonicalPages, parentInput: CanonicalRecord, chunkInputs: readonly CanonicalRecord[]) {
  jsonBytes(parentInput); check(chunkInputs.length <= 8, 'unbounded observation proof');
  chunkInputs.forEach(row => jsonBytes(row));
  const parent = structuredClone(parentInput), chunks = structuredClone(chunkInputs);
  const header = observationHeader(parent.value);
  observationHeaderRecord(parent, { sequence: header.sequence, id: parent.id });
  check(chunks.length === header.chunks.length, 'incomplete observation proof');
  const cells = chunks.flatMap((row, index) => observationChunkRecord(row, parent, header, index));
  observationCoverage(header, cells);
  const proof = json({ schema: 1, recordId: parent.id, revision: parent.revision,
    headerDigest: observationDigest(parent), chunkDigests: chunks.map(observationDigest) });
  jsonBytes(proof, MAX_OBSERVATION_PROOF_BYTES);
  const key = observationIntegrityKey(header.sequence);
  check(!await pages.get('knowledge', key), 'observation integrity already exists');
  return pages.set('knowledge', key, proof);
}

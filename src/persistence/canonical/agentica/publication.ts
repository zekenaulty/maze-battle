import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest } from '../types';
import { gameCheckpoint } from '../game/checkpoint';
import { validateKnowledge } from '../knowledge/evidence';
import { knowledgeAnchor } from '../knowledge/validation';
import { check, validId } from '../validation';
import { equal } from './validation';
import { readSource, source, writeSource } from './validation.source';
import type { ProtocolRead, ProtocolRef, Publication } from './types';

const key = (attempt: string) => { check(validId(attempt), 'invalid publication identity'); return `agentica/publications/${attempt}`; };

/** Return receipt fields with the caller's other outcome fields; one source anchor per transaction. */
export async function retainPublication(tx: CanonicalWork, request: CanonicalRequest) {
  const anchor = source(tx, request, 'agentica-publication'), checkpoint = gameCheckpoint(tx.head.checkpoint);
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const { generation, gameId, revision, roots } = tx.head;
  const snapshot = structuredClone({ generation, gameId, revision, roots: { world: roots.world, knowledge: roots.knowledge }, checkpoint: tx.head.checkpoint });
  const publication: Publication = { ...anchor, kind: 'agentica-publication', snapshot, wireRevision: revision, observation: checkpoint.knowledge };
  return writeSource(tx, key(request.attemptId), publication);
}
/** Missing or malformed referenced sources throw; they are never interpreted as an absent publication. */
export async function readPublication(pages: ProtocolRead, ref: ProtocolRef): Promise<Publication> {
  const value = await readSource(pages, ref, 'agentica-publication', 'snapshot wireRevision observation') as Publication;
  check(ref.key === key(value.sourceAttemptId) && value.wireRevision === value.snapshot.revision, 'publication identity changed');
  knowledgeAnchor(value.observation);
  check(equal(value.observation, gameCheckpoint(value.snapshot.checkpoint).knowledge), 'publication observation source changed');
  return value;
}
/** Execution bookkeeping is irrelevant; custody, checkpoint and earned/world roots are not. */
export function assertPublicationCurrent(publication: Publication, head: CanonicalHead) {
  const snapshot = publication.snapshot;
  check(head.status === 'ready' && head.generation === snapshot.generation && head.gameId === snapshot.gameId
    && head.owner === publication.owner && head.epoch === publication.epoch && head.revision >= snapshot.revision
    && equal({ world: head.roots.world, knowledge: head.roots.knowledge }, snapshot.roots)
    && equal(head.checkpoint, snapshot.checkpoint), 'publication game state or custody changed');
}

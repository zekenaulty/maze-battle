import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest } from '../types';
import { gameCheckpoint } from '../game/checkpoint';
import { validateKnowledge } from '../knowledge/evidence';
import { knowledgeAnchor } from '../knowledge/validation';
import { check, validId } from '../validation';
import { equal, snapshotJson, snapshotReference } from './validation';
import { readSource, source, writeSource } from './validation.source';
import type { ProtocolRead, ProtocolRef, Publication } from './types';
import { bindReturnObjective, validateObjectiveSelection } from './objective.binding';

const key = (attempt: string) => { check(validId(attempt), 'invalid publication identity'); return `agentica/publications/${attempt}`; };

/** Return receipt fields with the caller's other outcome fields; one source anchor per transaction. */
export async function retainPublication(tx: CanonicalWork, request: CanonicalRequest) {
  const head = snapshotJson(tx.head), anchor = source({ head }, request, 'agentica-publication'), checkpoint = gameCheckpoint(head.checkpoint);
  const { generation, gameId, revision, roots } = head;
  const snapshot = structuredClone({ generation, gameId, revision, roots: { world: roots.world, knowledge: roots.knowledge }, checkpoint: head.checkpoint });
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const objective = await bindReturnObjective({ ...tx, head }, anchor.sourceRequest);
  const publication: Publication = { ...anchor, kind: 'agentica-publication', snapshot, wireRevision: revision,
    observation: checkpoint.knowledge, ...(objective ? { objective } : {}) };
  return writeSource(tx, key(anchor.sourceAttemptId), publication);
}
/** Missing or malformed referenced sources throw; they are never interpreted as an absent publication. */
export async function readPublication(pages: ProtocolRead, ref: ProtocolRef): Promise<Publication> {
  ref = snapshotReference(ref);
  const value = await readSource(pages, ref, 'agentica-publication', 'snapshot wireRevision observation', 'objective') as Publication;
  check(ref.key === key(value.sourceAttemptId) && value.wireRevision === value.snapshot.revision, 'publication identity changed');
  knowledgeAnchor(value.observation);
  check(equal(value.observation, gameCheckpoint(value.snapshot.checkpoint).knowledge), 'publication observation source changed');
  validateObjectiveSelection(value.objective, value.sourceRequest);
  return value;
}
/** State equivalence only. Grant authority also requires explicit publication selection. */
export function assertPublicationCurrent(publication: Publication, head: CanonicalHead) {
  const snapshot = publication.snapshot;
  check(head.status === 'ready' && head.generation === snapshot.generation && head.gameId === snapshot.gameId
    && head.owner === publication.owner && head.epoch === publication.epoch && head.revision >= snapshot.revision
    && equal({ world: head.roots.world, knowledge: head.roots.knowledge }, snapshot.roots)
    && equal(head.checkpoint, snapshot.checkpoint), 'publication game state or custody changed');
}

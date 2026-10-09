import { emptyDirectedKnowledge, rememberDirected } from '../../domain/directed/knowledge';
import { DIRECTED_LIMITS, type KnowledgeProjection } from '../../domain/directed/types';
import { slotRange, type DirectedTransaction, type SaveRecord } from './database';
import { context, contextFromSource } from './journalValidation';
import { observation, projection } from './stateValidation';
import { check, same } from './values';

function sameProjection(left: KnowledgeProjection, right: KnowledgeProjection) {
  const withEdges = (value: KnowledgeProjection & { blockedEdges?: unknown }) => ({ ...value, blockedEdges: value.blockedEdges ?? {} });
  return same(withEdges(left), withEdges(right));
}

/** Read-only, transaction-local proof. No load/audit calls or cross-transaction cache. */
export async function validateLineage(tx: DirectedTransaction, slot: string, record: SaveRecord): Promise<void> {
  const current = record.session;
  check(record.counts.observations > 0 && record.counts.observations < DIRECTED_LIMITS.history,
    'missing or unbounded observation source');
  const contextsByRevision = new Map<number, string[]>();
  let contextCount = 0;
  let cursor = await tx.objectStore('contexts').openCursor(slotRange(slot));
  while (cursor) {
    check(++contextCount <= DIRECTED_LIMITS.history, 'context journal bound exceeded');
    const value = cursor.value;
    context(value, current);
    check(same(cursor.key, [slot, value.id]), 'context key mismatch');
    check(value.knowledgeRevision > 0, 'context missing historical observation');
    const ids = contextsByRevision.get(value.knowledgeRevision) ?? [];
    ids.push(value.id); contextsByRevision.set(value.knowledgeRevision, ids);
    cursor = await cursor.continue();
  }
  check(contextCount === record.counts.contexts, 'context count mismatch');

  let knowledge = emptyDirectedKnowledge(current.world.id, current.actor.id);
  const initial = await tx.objectStore('projections').get([slot, 0]);
  projection(initial); check(sameProjection(initial, knowledge), 'invalid initial projection');
  const observationIds = new Set<string>();
  let worldRevision = 0;
  // Stream snapshots instead of retaining up to 4096 full projections/context bodies.
  for (let sequence = 1; sequence <= record.counts.observations; sequence++) {
    const source = await tx.objectStore('observations').get([slot, sequence]);
    observation(source, current);
    check(source.sequence === sequence && !observationIds.has(source.id), 'observation sequence or identity mismatch');
    check(source.sourceWorldRevision >= worldRevision, 'observation world revision regressed');
    observationIds.add(source.id); worldRevision = source.sourceWorldRevision;
    knowledge = rememberDirected(knowledge, source);
    const stored = await tx.objectStore('projections').get([slot, sequence]);
    projection(stored);
    check(sameProjection(stored, knowledge), 'historical projection differs from sources');
    for (const contextId of contextsByRevision.get(sequence) ?? []) {
      const archived = await tx.objectStore('contexts').get([slot, contextId]);
      context(archived, current);
      contextFromSource(archived, knowledge, source, current.world.floorId);
    }
    if (sequence === record.counts.observations) {
      check(same(current.actor.position, source.scene.position), 'actor position differs from observation source');
    }
  }
  check(sameProjection(current.knowledge, knowledge), 'current projection differs from sources');
}

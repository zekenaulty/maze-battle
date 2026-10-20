import { readAcceptedQuest } from '../content/acceptedQueries';
import { readCarriedQuest } from '../content/carriedQuest';
import { contentKey } from '../content/records';
import { gameCheckpoint } from '../game/checkpoint';
import { loadObservation, validateKnowledge } from '../knowledge/evidence';
import type { CellSource, KnowledgeRead } from '../knowledge/types';
import { fields, natural } from '../roster/codec';
import type { CanonicalRecord, CanonicalSnapshot, RecordArea } from '../types';
import { check, identity, jsonBytes, record as validateRecord, validId } from '../validation';
import { same } from '../world/records';
import type { WorldRead } from '../world/types';
import { returnObjective, type ReturnObjective } from './objective.binding';
import { returnEvidence, type ReturnEvidence } from './objective.evidence.codec';

export { returnEvidence, returnSatisfied, type ReturnEvidence } from './objective.evidence.codec';

function capture(input: CanonicalSnapshot): CanonicalSnapshot {
  jsonBytes(input, 8192);
  const row = fields(input, 'generation gameId revision roots checkpoint');
  identity(input); natural(row.revision);
  const roots = fields(row.roots, 'world knowledge execution');
  check(Object.values(roots).every(root => root === null || validId(root)), 'invalid return evidence snapshot roots');
  gameCheckpoint(row.checkpoint);
  return structuredClone(input);
}

/**
 * Private evidence from a paired canonical reader/snapshot, never new sight or hidden geometry.
 * Carried custody validates the quest's award marker, not the original chest award source.
 * The owning result-proof layer must bind this evidence to the original objective/publication.
 */
export async function readReturnEvidence(pages: KnowledgeRead & WorldRead, input: CanonicalSnapshot,
  bound: ReturnObjective): Promise<ReturnEvidence> {
  const snapshot = capture(input), objective = returnObjective(bound), checkpoint = gameCheckpoint(snapshot.checkpoint);
  const get = pages.get.bind(pages), scan = pages.scan.bind(pages), witness = pages.witness.bind(pages);
  function record(row: CanonicalRecord, area: RecordArea, key?: string) {
    validateRecord(row, row.id, snapshot, area, key);
    check(row.revision <= snapshot.revision, 'return evidence source is newer than snapshot');
  }
  const read: KnowledgeRead & WorldRead = {
    async get(area, key) {
      const row = await get(area, key);
      if (row !== undefined) record(row, area, `record/${key}`);
      return row;
    },
    async scan(area, prefix, after, limit) {
      const page = await scan(area, prefix, after, limit);
      check(limit === 1 && Array.isArray(page.rows) && page.rows.length <= limit, 'unbounded return evidence scan');
      page.rows.forEach(row => record(row, area));
      return page;
    },
    witness,
  };
  const key = contentKey('quest', objective.quest.questId), current = await read.get('world', key);
  check(current, 'selected return quest is missing');
  const ref = { key, id: current.id }, accepted = await readAcceptedQuest(read, ref), q = accepted.quest.quest;
  check(q.id === objective.quest.questId && q.floor === 1 && q.task.objective === 'fetch' && q.task.required === 1
    && q.acceptedAt === objective.quest.acceptedAt && q.title === objective.quest.title && q.task.item && same(q.task.item, objective.quest.item),
  'return quest definition changed');
  const quest = await readCarriedQuest(read, ref);
  let arrival: CellSource | null = null;
  if (checkpoint.mode === 'manual' && same(checkpoint.position, objective.entrance.at)) {
    check(checkpoint.knowledge, 'return arrival requires earned observation');
    await validateKnowledge(read, checkpoint.knowledge);
    const source = { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id };
    const observation = await loadObservation(read, source);
    check(same(observation.header.actor, checkpoint.position), 'return observation actor differs from checkpoint');
    const index = observation.cells.findIndex(cell => same(cell.at, checkpoint.position));
    check(index >= 0 && observation.cells[index].stairs.includes('town'), 'return arrival lacks visible town stair');
    arrival = { ...source, index };
  }
  return returnEvidence({ schema: 1, generation: snapshot.generation, gameId: snapshot.gameId, quest, arrival });
}

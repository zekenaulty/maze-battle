import { movePosition, opposite } from '../../../domain/maze/movement';
import { check } from '../validation';
import { fields } from '../roster/codec';
import { same } from '../world/records';
import { cellKey, KNOWLEDGE_PREFIX, observationKey } from './keys';
import { cellSource, knowledgeAnchor, observationHeader, observationRef, observedCell } from './validation';
import { DIRECTIONS, OBSERVATION_CHUNK_SIZE, type CellSource, type KnowledgeAnchor, type KnowledgeRead, type ObservationRef, type ObservedCell } from './types';

export async function validateKnowledge(pages: KnowledgeRead, anchor: KnowledgeAnchor | null) {
  knowledgeAnchor(anchor);
  const actual = await pages.witness('knowledge', KNOWLEDGE_PREFIX);
  check(anchor ? actual === anchor.witness : actual === null, 'knowledge namespace differs from checkpoint');
  if (anchor) await loadObservation(pages, { sequence: anchor.sequence, id: anchor.id });
}

/** Snapshot-owned evidence only: never consult authoritative world geometry or mutations. */
export async function loadObservation(pages: KnowledgeRead, reference: ObservationRef) {
  observationRef(reference);
  const key = observationKey(reference.sequence), record = await pages.get('knowledge', key);
  check(record?.id === reference.id, 'missing or replaced source observation');
  const header = observationHeader(record.value);
  check(header.sequence === reference.sequence && header.revision === record.revision, 'observation revision mismatch');
  const cells: ObservedCell[] = [];
  for (let i = 0; i < header.chunks.length; i++) {
    const row = await pages.get('knowledge', `${key}/${i}`);
    check(row?.id === header.chunks[i] && row.revision === header.revision, 'missing or replaced observation chunk');
    const chunk = fields(row.value, 'schema sequence offset cells');
    check(chunk.schema === 1 && chunk.sequence === header.sequence && chunk.offset === cells.length
      && Array.isArray(chunk.cells) && chunk.cells.length === Math.min(OBSERVATION_CHUNK_SIZE, header.count - cells.length), 'invalid observation chunk');
    for (const cell of chunk.cells) { observedCell(cell); cells.push(cell); }
  }
  const byCell = new Map(cells.map(c => [cellKey(c.at), c]));
  check(byCell.size === cells.length && byCell.has(cellKey(header.actor)), 'invalid observation coverage');
  for (const c of cells) {
    check(c.at.level === header.actor.level, 'foreign observation level');
    for (const d of DIRECTIONS) {
      const target = c.edges[d]; if (!target) continue;
      const other = byCell.get(cellKey(target));
      check(other && same(other.edges[opposite(d)] ?? null, c.at)
        && same(other.world, movePosition(c.world, d)), 'observation exposes an uncovered or contradictory edge');
    }
  }
  return { header, cells };
}

export function sourceReader(pages: KnowledgeRead) {
  const cache = new Map<string, Awaited<ReturnType<typeof loadObservation>>>();
  return async (source: CellSource) => {
    cellSource(source);
    let observation = cache.get(source.id);
    if (!observation) {
      observation = await loadObservation(pages, { sequence: source.sequence, id: source.id }); cache.set(source.id, observation);
    }
    check(observation.header.sequence === source.sequence && source.index < observation.cells.length, 'invalid cell source');
    return observation.cells[source.index];
  };
}

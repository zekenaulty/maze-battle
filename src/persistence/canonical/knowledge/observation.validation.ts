import { movePosition, opposite } from '../../../domain/maze/movement';
import { fields } from '../roster/codec';
import type { CanonicalRecord, GameIdentity } from '../types';
import { check, record } from '../validation';
import { same } from '../world/records';
import { cellKey, observationKey } from './keys';
import { observationHeader, observationRef, observedCell } from './validation';
import { DIRECTIONS, OBSERVATION_CHUNK_SIZE, type ObservationHeader, type ObservationRef, type ObservedCell } from './types';

export function observationRecord(row: CanonicalRecord | undefined, key: string, scope?: GameIdentity): asserts row is CanonicalRecord {
  check(row, 'missing observation evidence');
  fields(row, 'generation gameId id area key value indexes revision');
  record(row, row.id, scope ?? row, 'knowledge', `record/${key}`);
  check(row.indexes.length === 0, 'observation evidence cannot have secondary indexes');
}

export function observationHeaderRecord(row: CanonicalRecord | undefined, reference: ObservationRef) {
  observationRef(reference); observationRecord(row, observationKey(reference.sequence));
  check(row.id === reference.id, 'missing or replaced source observation');
  const header = observationHeader(row.value);
  check(header.sequence === reference.sequence && header.revision === row.revision, 'observation revision mismatch');
  return header;
}

export function observationChunkRecord(row: CanonicalRecord | undefined, parent: CanonicalRecord, header: ObservationHeader, index: number) {
  observationRecord(row, `${observationKey(header.sequence)}/${index}`, parent);
  check(row.id === header.chunks[index] && row.revision === header.revision, 'missing or replaced observation chunk');
  const chunk = fields(row.value, 'schema sequence offset cells'), offset = index * OBSERVATION_CHUNK_SIZE;
  check(chunk.schema === 1 && chunk.sequence === header.sequence && chunk.offset === offset
    && Array.isArray(chunk.cells) && chunk.cells.length === Math.min(OBSERVATION_CHUNK_SIZE, header.count - offset), 'invalid observation chunk');
  for (const cell of chunk.cells) {
    observedCell(cell); check(cell.at.level === header.actor.level, 'foreign observation level');
  }
  return chunk.cells as unknown as ObservedCell[];
}

/** Whole-observation semantics: use at creation and full load, never claim them from one chunk. */
export function observationCoverage(header: ObservationHeader, cells: ObservedCell[]) {
  const byCell = new Map(cells.map(c => [cellKey(c.at), c]));
  check(cells.length === header.count && byCell.size === cells.length && byCell.has(cellKey(header.actor)), 'invalid observation coverage');
  for (const c of cells) {
    check(c.at.level === header.actor.level, 'foreign observation level');
    for (const d of DIRECTIONS) {
      const target = c.edges[d]; if (!target) continue;
      const other = byCell.get(cellKey(target));
      check(other && same(other.edges[opposite(d)] ?? null, c.at)
        && same(other.world, movePosition(c.world, d)), 'observation exposes an uncovered or contradictory edge');
    }
  }
}

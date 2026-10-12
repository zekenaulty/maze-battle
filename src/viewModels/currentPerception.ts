import { mergeRpgCell } from '../domain/agentic/knowledge/mergeCell';
import { freeze, sourceOf } from '../domain/agentic/knowledge/shared';
import type { RpgObservation } from '../domain/agentic/knowledge/types';
import type { RpgPerceivedCell, RpgPerceptionRegion, RpgPerceptionScope } from '../domain/agentic/knowledge/perceptionTypes';
import { cellKey } from '../domain/maze/key';

/** Current sight can render while the derived historical index catches up. */
export function currentPerception(observation: RpgObservation, scope: RpgPerceptionScope,
  previous?: RpgPerceptionRegion, ancestors: readonly string[] = []): RpgPerceptionRegion {
  const source = sourceOf(observation);
  const contains = (a: RpgObservation['actor']) => a.floor === scope.floor && a.row >= scope.row
    && a.row < scope.row + scope.rows && a.column >= scope.column && a.column < scope.column + scope.columns;
  const cells = new Map<string, RpgPerceivedCell>();
  // Retain only a source proven to be on this immutable branch; never reuse a future save's pixels.
  if (previous?.source.gameId === observation.gameId &&
    (previous.snapshotId === observation.id || ancestors.includes(previous.snapshotId))) {
    for (const { fact } of previous.cells) if (contains(fact.address)) cells.set(cellKey(fact.address), { state: 'remembered', fact });
  }
  for (const cell of observation.cells) if (contains(cell.address)) {
    const key = cellKey(cell.address);
    cells.set(key, { state: 'visible', observation: cell, fact: mergeRpgCell(cells.get(key)?.fact, cell, source) });
  }
  return freeze(structuredClone({ kind: 'perception-region', snapshotId: observation.id, source, actor: observation.actor, scope,
    cells: [...cells.values()].sort((a, b) => a.fact.address.row - b.fact.address.row || a.fact.address.column - b.fact.address.column) }));
}

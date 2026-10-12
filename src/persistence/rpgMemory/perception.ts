import { freeze, integer, sourceOf, validAddress } from '../../domain/agentic/knowledge/shared';
import type { RpgPerceivedCell, RpgPerceptionRegion, RpgPerceptionScope } from '../../domain/agentic/knowledge/perceptionTypes';
import { cellMemoryKey } from './keys';
import { queryRpgMemory, type MemoryQuery } from './query';
import { requireMemory, type MemoryWork } from './types';

export const PERCEPTION_REGION_LIMITS = Object.freeze({ axis: 64, cells: 1024 });

function captureScope(input: RpgPerceptionScope): RpgPerceptionScope {
  requireMemory(input && typeof input === 'object');
  const { floor, row, column, rows, columns } = input;
  requireMemory(validAddress({ floor, row, column }) && integer(rows, 1, PERCEPTION_REGION_LIMITS.axis)
    && integer(columns, 1, PERCEPTION_REGION_LIMITS.axis) && rows * columns <= PERCEPTION_REGION_LIMITS.cells
    && validAddress({ floor, row: row + rows - 1, column: column + columns - 1 }));
  return { floor, row, column, rows, columns };
}

/** Fixed address work; no world bounds, scans, route selection or implicit discovery. */
export async function rpgPerceptionRegion(query: MemoryQuery, input: RpgPerceptionScope): Promise<RpgPerceptionRegion> {
  const scope = captureScope(input), { head, tree, cell } = query;
  const observation = head.observation, current = new Map(observation.cells.map(c => [cellMemoryKey(c.address), c]));
  const cells: RpgPerceivedCell[] = [];
  for (let row = scope.row; row < scope.row + scope.rows; row++) {
    for (let column = scope.column; column < scope.column + scope.columns; column++) {
      const address = { floor: scope.floor, row, column }, key = cellMemoryKey(address);
      const fact = await cell(await tree.get(key), address), visible = current.get(key);
      // A prepared index must contain the head's own facts. Never turn corruption into fog.
      requireMemory(!visible || fact?.source.id === head.id);
      if (fact) cells.push(visible ? { state: 'visible', fact, observation: visible } : { state: 'remembered', fact });
    }
  }
  return freeze(structuredClone({ kind: 'perception-region', snapshotId: head.id,
    source: sourceOf(observation), actor: observation.actor, scope, cells }));
}

/** Read-only shared display/tool projection. Preparation is a separate bounded operation. */
export function readRpgPerceptionRegion(slotId: string, input: RpgPerceptionScope, snapshotId?: string, work: MemoryWork = {}) {
  const scope = captureScope(input);
  return queryRpgMemory(slotId, snapshotId, work, query => rpgPerceptionRegion(query, scope));
}

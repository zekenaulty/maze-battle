import type { Direction } from '../../types';
import type { RpgEdgeFact, RpgObservedCell, RpgRememberedCell, RpgSource } from './types';

/** Cropped exits are not new walls; keep their earlier observed source. */
export function mergeRpgCell(previous: RpgRememberedCell | undefined, cell: RpgObservedCell, source: RpgSource): RpgRememberedCell {
  const edges: Partial<Record<Direction, RpgEdgeFact>> = { ...previous?.edges };
  for (const direction of cell.links) edges[direction] = { state: 'open', source };
  for (const direction of cell.blocked) edges[direction] = { state: 'blocked', source };
  return { address: cell.address, roomIds: cell.roomIds, chests: cell.chests, stairs: cell.stairs, edges, source };
}

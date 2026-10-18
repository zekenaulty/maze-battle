import { movePosition, opposite } from '../../../domain/maze/movement';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { cellKey } from './keys';
import { observedCell } from './validation';
import { DIRECTIONS, MAX_VISIBLE_CELLS, type ObservedCell } from './types';
import { MAX_EXPLORATION_READ_BYTES } from './explorationPolicy.read';

/** Engine input, not retained evidence. observePosition's BFS always places the actor first. */
export function explorationCells(input: readonly ObservedCell[], level: number): ObservedCell[] {
  check(Array.isArray(input) && input.length > 0 && input.length <= MAX_VISIBLE_CELLS, 'unbounded exploration sight');
  jsonBytes(input, MAX_EXPLORATION_READ_BYTES); input.forEach(observedCell);
  const cells = structuredClone(input) as ObservedCell[], byCell = new Map(cells.map(c => [cellKey(c.at), c]));
  check(byCell.size === cells.length && new Set(cells.map(c => `${c.world.row}:${c.world.column}`)).size === cells.length,
    'duplicate exploration coordinates');
  for (const cell of cells) {
    check(cell.at.level === level, 'foreign exploration floor');
    for (const direction of DIRECTIONS) {
      const target = cell.edges[direction]; if (!target) continue;
      const other = byCell.get(cellKey(target));
      check(other && same(other.edges[opposite(direction)] ?? null, cell.at)
        && same(other.world, movePosition(cell.world, direction)), 'uncovered or contradictory exploration edge');
    }
  }
  return cells;
}

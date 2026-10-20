import type { Direction, GridPosition } from '../../../domain/types';
import { movePosition, opposite } from '../../../domain/maze/movement';
import { gameCheckpoint } from '../game/checkpoint';
import type { CanonicalSnapshot } from '../types';
import { check } from '../validation';
import { same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { cellKey } from './keys';
import { readCanonicalRegion, type KnowledgeRegion, type KnowledgeRegionScope } from './region';
import { DIRECTIONS } from './types';

export const NAVIGATION_CELLS = 512;
export const NAVIGATION_STEPS = 64;
export interface KnownStep { from: WorldPosition; to: WorldPosition; direction: Direction }
export interface KnownRoute { steps: KnownStep[]; complete: boolean }

/** A finite coordinate window, not a request to enumerate the floor or discover unseen cells. */
export function navigationScope(floor: number, start: GridPosition, target: GridPosition): KnowledgeRegionScope | null {
  check([floor, start.row, start.column, target.row, target.column].every(Number.isSafeInteger) && floor > 0, 'invalid navigation coordinates');
  let rows = Math.abs(target.row - start.row) + 1, columns = Math.abs(target.column - start.column) + 1;
  if (rows > 64 || columns > 64 || rows * columns > NAVIGATION_CELLS) return null;
  const baseRows = rows, baseColumns = columns;
  while (true) {
    if (rows <= columns && rows + 2 <= 64 && (rows + 2) * columns <= NAVIGATION_CELLS) rows += 2;
    else if (columns + 2 <= 64 && rows * (columns + 2) <= NAVIGATION_CELLS) columns += 2;
    else if (rows + 2 <= 64 && (rows + 2) * columns <= NAVIGATION_CELLS) rows += 2;
    else break;
  }
  return { floor, row: Math.min(start.row, target.row) - Math.floor((rows - baseRows) / 2),
    column: Math.min(start.column, target.column) - Math.floor((columns - baseColumns) / 2), rows, columns };
}

export function findKnownRoute(region: KnowledgeRegion, start: WorldPosition, target: GridPosition,
  stepLimit = NAVIGATION_STEPS): KnownRoute | null {
  check(Number.isSafeInteger(stepLimit) && stepLimit > 0 && stepLimit <= NAVIGATION_CELLS, 'invalid route prefix bound');
  check(region.cells.length <= NAVIGATION_CELLS, 'navigation region exceeds cell bound');
  const cells = new Map(region.cells.map(({ cell }) => [cellKey(cell.at), cell]));
  check(cells.size === region.cells.length, 'duplicate navigation cell');
  const goals = region.cells.filter(({ cell }) => same(cell.world, target));
  check(goals.length <= 1, 'ambiguous navigation target');
  const first = cells.get(cellKey(start)), goal = goals[0]?.cell;
  if (!first || !goal || start.level !== region.scope.floor || goal.at.level !== start.level) return null;
  const visited = new Set([cellKey(start)]), queue = [first], previous = new Map<string, KnownStep>();
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cellKey(cell.at) === cellKey(goal.at)) {
      const steps: KnownStep[] = [];
      for (let key = cellKey(goal.at); key !== cellKey(start);) {
        const step = previous.get(key)!; steps.push(step); key = cellKey(step.from);
      }
      steps.reverse();
      return { steps: steps.slice(0, stepLimit), complete: steps.length <= stepLimit };
    }
    for (const direction of DIRECTIONS) {
      const target = cell.edges[direction]?.target;
      if (!target || target.level !== start.level || visited.has(cellKey(target))) continue;
      const next = cells.get(cellKey(target));
      const reverse = next?.edges[opposite(direction)]?.target;
      if (!next || !reverse || !same(reverse, cell.at) || !same(movePosition(cell.world, direction), next.world)) continue;
      visited.add(cellKey(target)); queue.push(next);
      previous.set(cellKey(target), { from: cell.at, to: next.at, direction });
    }
  }
  return null;
}

export async function readNavigationRoute(snapshot: CanonicalSnapshot, startWorld: GridPosition, target: GridPosition, signal?: AbortSignal) {
  const checkpoint = gameCheckpoint(snapshot.checkpoint), start = structuredClone(checkpoint.position);
  const origin = { ...startWorld }, destination = { ...target }, scope = navigationScope(start.level, origin, destination);
  if (!scope || checkpoint.mode === 'town') return null;
  // readCanonicalRegion validates the knowledge witness once and owns all evidence reads at these roots.
  const { value } = await readCanonicalRegion(snapshot, scope, signal);
  check(same(value.actor, origin), 'navigation origin differs from earned observation');
  return findKnownRoute(value, start, destination);
}

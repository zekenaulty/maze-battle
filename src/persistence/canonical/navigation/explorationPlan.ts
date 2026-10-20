import { movePosition } from '../../../domain/maze/movement';
import type { GameCheckpoint } from '../game/checkpoint';
import { findKnownRoute, NAVIGATION_CELLS } from '../knowledge/navigation';
import { readKnowledgeRegion, type KnowledgeRegionScope } from '../knowledge/region';
import { readKnownCells } from '../knowledge/queries';
import { DIRECTIONS, type KnowledgeRead } from '../knowledge/types';
import type { WorldPosition } from '../world/types';
import { same } from '../world/records';
import { RETAINED_ROUTE_STEPS, type RouteStep } from './types';

export const EXPLORATION_QUERY_SIDE = 21;
export type ExplorationPlan = { target: WorldPosition; route: RouteStep[]; window: KnowledgeRegionScope } | null;
const windowAt = (floor: number, world: { row: number; column: number }) => ({ floor,
  row: world.row - Math.floor(EXPLORATION_QUERY_SIDE / 2), column: world.column - Math.floor(EXPLORATION_QUERY_SIDE / 2),
  rows: EXPLORATION_QUERY_SIDE, columns: EXPLORATION_QUERY_SIDE });

export async function localExplorationWindow(pages: KnowledgeRead, checkpoint: GameCheckpoint) {
  const [actor] = await readKnownCells(pages, checkpoint, [checkpoint.position]);
  if (actor.state !== 'visible') return null;
  return windowAt(checkpoint.position.level, actor.cell.world);
}

/** Local earned coverage, not an engine room extent or a claim that the entire room is mapped. */
export async function planLocalExploration(pages: KnowledgeRead, checkpoint: GameCheckpoint, spaceId: string): Promise<ExplorationPlan> {
  const [actor] = await readKnownCells(pages, checkpoint, [checkpoint.position]);
  if (actor.state !== 'visible' || checkpoint.position.cell.spaceId !== spaceId) return null;
  const window = windowAt(checkpoint.position.level, actor.cell.world);
  const region = await readKnowledgeRegion(pages, checkpoint, window);
  const all = new Set(region.cells.map(c => `${c.cell.world.row}:${c.cell.world.column}`));
  const scoped = { ...region, cells: region.cells.filter(c => c.cell.at.cell.spaceId === spaceId) };
  let best: { target: WorldPosition; route: RouteStep[]; row: number; column: number } | null = null;
  for (const { cell } of scoped.cells) {
    if (same(cell.at, checkpoint.position)) continue;
    const unresolved = DIRECTIONS.some(d => {
      const next = movePosition(cell.world, d);
      return next.row >= region.scope.row && next.row < region.scope.row + region.scope.rows
        && next.column >= region.scope.column && next.column < region.scope.column + region.scope.columns
        && !Object.hasOwn(cell.edges, d) && !all.has(`${next.row}:${next.column}`);
    });
    if (!unresolved) continue;
    // Rank by full bounded path length, not equal-length truncated prefixes.
    const route = findKnownRoute(scoped, checkpoint.position, cell.world, NAVIGATION_CELLS);
    if (!route?.complete || !route.steps.length) continue;
    const candidate = { target: cell.at, route: route.steps.map(({ direction, to }) => ({ direction, to })),
      row: cell.world.row, column: cell.world.column };
    if (!best || candidate.route.length < best.route.length || candidate.route.length === best.route.length
      && (candidate.row < best.row || candidate.row === best.row && candidate.column < best.column)) best = candidate;
  }
  return best && { target: structuredClone(best.target), route: best.route.slice(0, RETAINED_ROUTE_STEPS), window };
}

/** Retained paths may use only this space's earned cells, including when backtracking to another local boundary. */
export async function planScopedApproach(pages: KnowledgeRead, checkpoint: GameCheckpoint, target: WorldPosition,
  retainedWindow?: KnowledgeRegionScope): Promise<RouteStep[] | null> {
  const [actor, goal] = await readKnownCells(pages, checkpoint, [checkpoint.position, target]);
  if (actor.state !== 'visible' || goal.state === 'unknown' || target.cell.spaceId !== checkpoint.position.cell.spaceId) return null;
  const window = retainedWindow ?? (await localExplorationWindow(pages, checkpoint))!;
  const region = await readKnowledgeRegion(pages, checkpoint, window);
  const route = findKnownRoute({ ...region, cells: region.cells.filter(c => c.cell.at.cell.spaceId === target.cell.spaceId) }, checkpoint.position, goal.cell.world);
  // A non-null route proves reachability; complete describes only its returned prefix.
  return route ? route.steps.slice(0, RETAINED_ROUTE_STEPS).map(({ direction, to }) => ({ direction, to })) : null;
}

import { movePosition, opposite } from '../../../domain/maze/movement';
import type { GameCheckpoint } from '../game/checkpoint';
import { readKnownCells } from '../knowledge/queries';
import { findKnownRoute, navigationScope } from '../knowledge/navigation';
import { readKnowledgeRegion } from '../knowledge/region';
import type { KnowledgeRead } from '../knowledge/types';
import { same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { RETAINED_ROUTE_STEPS, type RouteStep, type DestinationReason } from './types';

export type DestinationPlan = { route: RouteStep[]; reason: DestinationReason | null };
/** Evidence-only: this adapter cannot read authoritative world records. */
export async function planDestination(pages: KnowledgeRead, checkpoint: GameCheckpoint, target: WorldPosition): Promise<DestinationPlan> {
  if (checkpoint.mode === 'town') return { route: [], reason: 'unavailable' };
  if (checkpoint.position.level !== target.level) return { route: [], reason: 'scope-limit' };
  const atTarget = same(checkpoint.position, target);
  const cells = await readKnownCells(pages, checkpoint, atTarget ? [target] : [checkpoint.position, target]);
  const start = cells[0], goal = cells.at(-1)!;
  if (start.state === 'unknown' || goal.state === 'unknown') return { route: [], reason: 'unknown-destination' };
  if (start.state !== 'visible') return { route: [], reason: 'unavailable' };
  if (atTarget) return { route: [], reason: 'arrived' };
  const scope = navigationScope(target.level, start.cell.world, goal.cell.world);
  if (!scope) return { route: [], reason: 'scope-limit' };
  const region = await readKnowledgeRegion(pages, checkpoint, scope), route = findKnownRoute(region, checkpoint.position, goal.cell.world);
  return route ? { route: route.steps.slice(0, RETAINED_ROUTE_STEPS).map(step => ({ direction: step.direction, to: step.to })), reason: null }
    : { route: [], reason: 'route-unavailable' };
}

export async function knownStep(pages: KnowledgeRead, checkpoint: GameCheckpoint, step: RouteStep) {
  if (same(checkpoint.position, step.to) || checkpoint.position.level !== step.to.level) return false;
  const [from, to] = await readKnownCells(pages, checkpoint, [checkpoint.position, step.to]);
  return from.state !== 'unknown' && to.state !== 'unknown' && same(from.cell.edges[step.direction]?.target ?? null, step.to)
    && same(to.cell.edges[opposite(step.direction)]?.target ?? null, checkpoint.position)
    && same(movePosition(from.cell.world, step.direction), to.cell.world);
}

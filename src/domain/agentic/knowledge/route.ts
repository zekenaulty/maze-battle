import type { Direction } from '../../types';
import { shortestRoutes } from '../../expedition/shortestRoutes';
import { cellKey } from '../../maze/key';
import { opposite } from '../../maze/movement';
import { cellAt, freeze, integer, knownNeighbours, refused, validAddress } from './shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgKnowledge, type RpgKnownRoute,
  type RpgRefusal, type RpgRouteBudget, type RpgSource, type RpgUnknown } from './types';

/** Point reads on remembered cells only; there is no GameState argument or hidden fallback. */
export function knownRpgRoute(knowledge: RpgKnowledge, origin: RpgAddress, target: RpgAddress,
  budget: RpgRouteBudget): RpgKnownRoute | RpgRefusal | RpgUnknown {
  if (!validAddress(origin) || !validAddress(target)) return refused('invalid_checkpoint');
  if (!budget || !integer(budget.maxVisits, 1, LIMITS.routeVisits)
    || !integer(budget.maxSteps, 0, LIMITS.routeSteps)) return refused('invalid_budget');
  if (origin.floor !== target.floor) return refused('cross_floor');
  if (!cellAt(knowledge, origin)) return { status: 'unknown', reason: 'origin_unknown' };
  if (!cellAt(knowledge, target)) return { status: 'unknown', reason: 'target_unknown' };
  const start = cellKey(origin);
  const end = cellKey(target);
  const cells = knowledge.floors[origin.floor].cells;
  try {
    let found = start === end;
    const tree = shortestRoutes<string, Direction>(start, key => {
      if (found) return [];
      const next = knownNeighbours(knowledge, cells[key].address)
        .map(next => ({ key: cellKey(next.address), edge: next.direction }));
      const targetIndex = next.findIndex(next => next.key === end);
      if (targetIndex < 0) return next;
      // Unit-cost BFS has found the shortest path; do not expand the remaining component.
      found = true;
      return next.slice(0, targetIndex + 1);
    }, budget.maxVisits);
    const destination = tree.get(end);
    if (!destination) return { status: 'unknown', reason: 'no_known_route' };
    if (destination.distance > budget.maxSteps) return refused('step_limit');
    const path: RpgAddress[] = [];
    const directions: Direction[] = [];
    const sources = new Map<string, RpgSource>();
    const remember = (source: RpgSource) => sources.set(source.id, source);
    remember(cells[start].source);
    for (let node = destination; node.previous !== undefined; node = tree.get(node.previous)!) {
      path.push(cells[node.key].address);
      directions.push(node.edge!);
      remember(cells[node.previous].edges[node.edge!]!.source);
      remember(cells[node.key].edges[opposite(node.edge!)]!.source);
    }
    return freeze(structuredClone({ status: 'ready', origin, target, path: path.reverse(), directions: directions.reverse(),
      distance: destination.distance, visits: tree.size, sources: [...sources.values()] } satisfies RpgKnownRoute));
  } catch (error) {
    if (error instanceof Error && error.message === 'Route visit budget exhausted.') return refused('visit_limit');
    throw error;
  }
}

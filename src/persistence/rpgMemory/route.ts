import type { Direction } from '../../domain/types';
import { shortestRoutesAsync } from '../../domain/expedition/shortestRoutes';
import { cellKey } from '../../domain/maze/key';
import { movePosition, opposite } from '../../domain/maze/movement';
import { directions, freeze, integer, refused, validAddress } from '../../domain/agentic/knowledge/shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgKnownRoute, type RpgRefusal,
  type RpgRememberedCell, type RpgRouteBudget, type RpgSource, type RpgUnknown } from '../../domain/agentic/knowledge/types';
import { cellMemoryKey } from './keys';
import { queryRpgMemory, type MemoryQuery } from './query';
import type { MemoryWork } from './types';

/** Only point-read, provenance-validated cells from the caller's snapshot and transaction. */
export async function routeRpgMemory(query: MemoryQuery, origin: RpgAddress, target: RpgAddress,
  budget: RpgRouteBudget): Promise<RpgKnownRoute | RpgRefusal | RpgUnknown> {
  if (!validAddress(origin) || !validAddress(target)) return refused('invalid_checkpoint');
  if (!budget || !integer(budget.maxVisits, 1, LIMITS.routeVisits)
    || !integer(budget.maxSteps, 0, LIMITS.routeSteps)) return refused('invalid_budget');
  if (origin.floor !== target.floor) return refused('cross_floor');
  origin = structuredClone(origin); target = structuredClone(target);
  const { maxVisits, maxSteps } = budget;
  const cells = new Map<string, RpgRememberedCell | undefined>();
  const read = async (address: RpgAddress) => {
    const key = cellKey(address);
    if (!cells.has(key)) cells.set(key, await query.cell(await query.tree.get(cellMemoryKey(address)), address));
    return cells.get(key);
  };
  if (!await read(origin)) return { status: 'unknown', reason: 'origin_unknown' };
  if (!await read(target)) return { status: 'unknown', reason: 'target_unknown' };
  const start = cellKey(origin), end = cellKey(target);
  try {
    let found = start === end;
    const tree = await shortestRoutesAsync<string, Direction>(start, async key => {
      if (found) return [];
      const current = cells.get(key)!, next: { key: string; edge: Direction }[] = [];
      for (const direction of directions) {
        if (current.edges[direction]?.state !== 'open') continue;
        const address = { floor: origin.floor, ...movePosition(current.address, direction) };
        if (!validAddress(address) || (await read(address))?.edges[opposite(direction)]?.state !== 'open') continue;
        const key = cellKey(address);
        next.push({ key, edge: direction });
        // Discovery fixes the shortest path; later neighbours cannot improve it.
        if (key === end) { found = true; break; }
      }
      return next;
    }, maxVisits);
    const destination = tree.get(end);
    if (!destination) return { status: 'unknown', reason: 'no_known_route' };
    if (destination.distance > maxSteps) return refused('step_limit');
    const path: RpgAddress[] = [], steps: Direction[] = [], sources = new Map<string, RpgSource>();
    const remember = (source: RpgSource) => sources.set(source.id, source);
    remember(cells.get(start)!.source);
    for (let node = destination; node.previous !== undefined; node = tree.get(node.previous)!) {
      path.push(cells.get(node.key)!.address);
      steps.push(node.edge!);
      remember(cells.get(node.previous)!.edges[node.edge!]!.source);
      remember(cells.get(node.key)!.edges[opposite(node.edge!)]!.source);
    }
    return freeze(structuredClone({ status: 'ready', origin, target, path: path.reverse(), directions: steps.reverse(),
      distance: destination.distance, visits: tree.size, sources: [...sources.values()] } satisfies RpgKnownRoute));
  } catch (error) {
    if (error instanceof Error && error.message === 'Route visit budget exhausted.') return refused('visit_limit');
    throw error;
  }
}

export function readRpgRoute(slotId: string, origin: RpgAddress, target: RpgAddress, budget: RpgRouteBudget,
  snapshotId?: string, work: MemoryWork = {}) {
  const request = structuredClone({ origin, target, budget });
  return queryRpgMemory(slotId, snapshotId, work, query => routeRpgMemory(query, request.origin, request.target, request.budget));
}

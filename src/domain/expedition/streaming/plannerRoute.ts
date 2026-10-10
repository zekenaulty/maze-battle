import { movePosition } from '../../maze/movement';
import type { Direction } from '../../types';
import { addressKey } from '../address';
import { copyAddress } from '../explorationGraph';
import type { CellAddress } from '../types';
import { shortestRoutes } from '../shortestRoutes';
import { STREAM_PLANNER_LIMITS, type PlannerPage, type StreamPlannerWork } from './plannerPage';
import type { StreamCheckpoint, StreamCommand } from './types';

export interface PlannerStep {
  from: CellAddress;
  to?: CellAddress;
  command: StreamCommand;
  kind: 'local' | 'unseen' | 'exit' | 'collect' | 'prepare' | 'finish';
  objectiveId?: string;
  target: CellAddress;
  reason: string;
}
interface RouteNode { address: CellAddress; distance: number; previous?: string; direction?: Direction }
type Search = Map<string, RouteNode>;

function search(page: PlannerPage, start: CellAddress, work: StreamPlannerWork): Search {
  work.searches++;
  const reached = shortestRoutes(addressKey(start), key => {
    const cell = page.cells.get(key)!;
    return cell.links.flatMap(direction => {
      work.examinedLinks++;
      const address = { ...movePosition(cell, direction), spaceId: page.spaceId };
      return page.cells.has(addressKey(address)) ? [{ key: addressKey(address), edge: direction }] : [];
    });
  }, STREAM_PLANNER_LIMITS.cells, () => work.expandedCells++);
  return new Map([...reached].map(([key, node]) => [key, {
    address: copyAddress(page.cells.get(key)!), distance: node.distance, previous: node.previous, direction: node.edge,
  }]));
}

function path(search: Search, target: CellAddress, reason: string): PlannerStep[] {
  const steps: PlannerStep[] = [];
  const targetNode = search.get(addressKey(target));
  if (!targetNode) throw new Error('No observed path to the objective.');
  let node: RouteNode = targetNode;
  while (node.previous !== undefined) {
    const from: RouteNode = search.get(node.previous)!;
    steps.push({ from: copyAddress(from.address), to: copyAddress(node.address), command: { type: 'move', direction: node.direction! },
      kind: 'local', target: copyAddress(target), reason });
    node = from;
  }
  return steps.reverse();
}

function nearest<T extends CellAddress>(items: T[], tree: Search): T | undefined {
  let found: T | undefined;
  let distance = Infinity;
  for (const item of items) {
    const next = tree.get(addressKey(item))?.distance ?? Infinity;
    if (next < distance) { found = item; distance = next; }
  }
  return found;
}

/** Exact local shortest paths, greedy nearby loot, then tree DFS ports. Not a global tour. */
export function planPageRoute(page: PlannerPage, checkpoint: StreamCheckpoint, maxSteps: number, work: StreamPlannerWork): PlannerStep[] {
  work.plans++;
  let tree = search(page, checkpoint.position, work);
  const steps: PlannerStep[] = [];
  const loot = page.chests.filter(chest => !chest.opened);
  for (let count = 0; count < STREAM_PLANNER_LIMITS.chestObjectives && steps.length < maxSteps; count++) {
    const chest = nearest(loot, tree);
    if (!chest) break;
    const reason = 'Collect nearby observed chests.';
    steps.push(...path(tree, chest, reason), { from: copyAddress(chest), command: { type: 'collect' },
      kind: 'collect', objectiveId: chest.id, target: copyAddress(chest), reason });
    loot.splice(loot.indexOf(chest), 1);
    if (!loot.length || steps.length >= maxSteps || count + 1 === STREAM_PLANNER_LIMITS.chestObjectives) break;
    tree = search(page, chest, work);
  }
  if (steps.length) return steps.slice(0, maxSteps);

  // Unknown cells are terminal steps, reached only through an explicitly observed local link.
  for (const node of tree.values()) {
    for (const direction of page.cells.get(addressKey(node.address))!.links) {
      const target = { ...movePosition(node.address, direction), spaceId: page.spaceId };
      if (page.cells.has(addressKey(target))) continue;
      const reason = 'Explore an observed local link.';
      return [...path(tree, node.address, reason), { from: copyAddress(node.address), to: target,
        command: { type: 'move', direction } as const, kind: 'unseen' as const, target, reason }].slice(0, maxSteps);
    }
  }
  if (tree.size !== page.cells.size || loot.length) throw new Error('Observed local work has no known path.');
  const frontier = nearest(page.frontiers, tree);
  if (frontier) {
    const reason = 'Prepare an observed pending doorway.';
    return [...path(tree, frontier, reason), { from: copyAddress(frontier), command: { type: 'prepare', frontierId: frontier.id } as const,
      kind: 'prepare' as const, objectiveId: frontier.id, target: copyAddress(frontier), reason }].slice(0, maxSteps);
  }
  const child = nearest(page.openings.filter(port => port.id !== page.parentOpeningId && !page.completedExits.has(port.id)), tree);
  const opening = child ?? page.openings.find(port => port.id === page.parentOpeningId);
  if (opening) {
    const reason = child ? 'Visit an uncleared observed child exit.' : 'Backtrack through the learned parent port.';
    return [...path(tree, opening, reason), { from: copyAddress(opening), to: opening.destination && copyAddress(opening.destination),
      command: { type: 'move', direction: opening.direction } as const, kind: 'exit' as const, objectiveId: opening.id,
      target: copyAddress(opening.destination ?? opening), reason }].slice(0, maxSteps);
  }
  if (page.spaceId !== checkpoint.home.spaceId) throw new Error('No learned parent route.');
  const reason = 'Return home and request host validation of finite-scope completion.';
  return [...path(tree, checkpoint.home, reason), { from: copyAddress(checkpoint.home), command: { type: 'finish' } as const,
    kind: 'finish' as const, target: copyAddress(checkpoint.home), reason }].slice(0, maxSteps);
}

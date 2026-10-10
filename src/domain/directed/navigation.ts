import { addressKey, sameAddress } from '../expedition/address';
import { compass } from '../expedition/explorationGraph';
import { shortestRoutes } from '../expedition/shortestRoutes';
import type { CellAddress } from '../expedition/types';
import type { NavigationTarget } from './operationTypes';
import { DIRECTED_LIMITS, type DirectedCell, type DirectedWorld, type KnowledgeProjection } from './types';
import { canTraverseDirected } from './world';

export type DirectedGraph = ReadonlyMap<string, DirectedCell>;

/** Only remembered facts enter this projection. No authoritative fallback. */
export function actorNavigationGraph(knowledge: KnowledgeProjection): DirectedGraph {
  const blocked = new Set(Object.values(knowledge.features).filter(({ value }) => value.kind === 'door'
    && (value.state === 'closed' || value.state === 'locked')).map(({ value }) => addressKey(value.position)));
  return new Map(Object.values(knowledge.cells).map(({ value }) => [addressKey(value.address), {
    address: { ...value.address }, exits: Object.fromEntries(Object.entries(value.exits)
      .filter(([, to]) => !blocked.has(addressKey(to)) && !knowledge.blockedEdges?.[`${addressKey(value.address)}>${addressKey(to)}`])
      .map(([direction, to]) => [direction, { ...to }])),
  }]));
}

/** Privileged diagnostics/generation only; never accepted by the actor executor. */
export function systemNavigationGraph(world: DirectedWorld): DirectedGraph {
  return new Map(Object.values(world.cells).map(cell => [addressKey(cell.address), {
    address: { ...cell.address }, exits: Object.fromEntries(Object.entries(cell.exits)
      .filter(([, to]) => canTraverseDirected(world, cell.address, to)).map(([direction, to]) => [direction, { ...to }])),
  }]));
}

export function routeHasEdge(graph: DirectedGraph, from: CellAddress, to: CellAddress): boolean {
  return Object.values(graph.get(addressKey(from))?.exits ?? {}).some(next => sameAddress(next, to));
}

function destinations(knowledge: KnowledgeProjection, target: NavigationTarget): string[] {
  const graph = actorNavigationGraph(knowledge);
  if (target.kind === 'cell') return graph.has(addressKey(target.address)) ? [addressKey(target.address)] : [];
  const feature = knowledge.features[target.featureId]?.value;
  if (!feature) return [];
  return [...graph].filter(([, cell]) => sameAddress(cell.address, feature.position)
    || routeHasEdge(graph, cell.address, feature.position) || routeHasEdge(graph, feature.position, cell.address)).map(([key]) => key);
}

export function hasArrived(knowledge: KnowledgeProjection, position: CellAddress, target: NavigationTarget): boolean {
  return destinations(knowledge, target).includes(addressKey(position));
}

export type NavigationPlan = { status: 'ready'; route: CellAddress[]; distance: number; visits: number }
  | { status: 'unavailable'; reason: 'Destination is not known.' | 'No known route.' | 'Known-map budget exceeded.' };

/** Same search for either graph; callers must choose their authority before entering. */
export function searchDirectedRoutes(graph: DirectedGraph, start: CellAddress) {
  if (graph.size > DIRECTED_LIMITS.cells || !graph.has(addressKey(start))) throw new Error('Invalid bounded graph.');
  return shortestRoutes(addressKey(start), key => compass.flatMap(direction => {
    const to = graph.get(key)?.exits[direction];
    return to && graph.has(addressKey(to)) ? [{ key: addressKey(to), edge: direction }] : [];
  }), DIRECTED_LIMITS.cells);
}

export function planKnownDestination(knowledge: KnowledgeProjection, start: CellAddress, target: NavigationTarget): NavigationPlan {
  const graph = actorNavigationGraph(knowledge);
  if (graph.size > DIRECTED_LIMITS.cells) return { status: 'unavailable', reason: 'Known-map budget exceeded.' };
  const targets = destinations(knowledge, target);
  if (!targets.length || !graph.has(addressKey(start))) return { status: 'unavailable', reason: 'Destination is not known.' };
  const tree = searchDirectedRoutes(graph, start);
  const destination = targets.filter(key => tree.has(key)).sort((a, b) => tree.get(a)!.distance - tree.get(b)!.distance || a.localeCompare(b))[0];
  if (!destination) return { status: 'unavailable', reason: 'No known route.' };
  const route: CellAddress[] = [];
  for (let node = tree.get(destination)!; node.previous !== undefined; node = tree.get(node.previous)!) {
    route.push({ ...graph.get(node.key)!.address });
  }
  return { status: 'ready', route: route.reverse(), distance: tree.get(destination)!.distance, visits: tree.size };
}

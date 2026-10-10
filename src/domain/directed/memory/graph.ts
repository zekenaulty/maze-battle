import { addressKey, sameAddress } from '../../expedition/address';
import { compass } from '../../expedition/explorationGraph';
import { shortestRoutes } from '../../expedition/shortestRoutes';
import type { CellAddress } from '../../expedition/types';
import { actorNavigationGraph, routeHasEdge, searchDirectedRoutes } from '../navigation';
import { DIRECTED_LIMITS, type KnowledgeProjection } from '../types';
import { compareIds, evidence, own } from './evidence';
import { geographicBearing } from './geography';
import type { MemoryRoute, RoomConnection, RoomMemorySummary } from './types';

export function createMemoryIndex(knowledge: KnowledgeProjection, position: CellAddress) {
  const cells = Object.values(knowledge.cells).sort((a, b) => compareIds(addressKey(a.value.address), addressKey(b.value.address)));
  const features = Object.values(knowledge.features).sort((a, b) => compareIds(a.value.id, b.value.id));
  const blocked = Object.values(knowledge.blockedEdges ?? {});
  const doors = features.filter(entry => entry.value.kind === 'door');
  const roomIds = [...new Set([...Object.keys(knowledge.spaces), ...cells.map(entry => entry.value.address.spaceId),
    ...features.map(entry => entry.value.position.spaceId)])].sort(compareIds);
  if (roomIds.length > DIRECTED_LIMITS.cells) throw new Error('Memory room search budget exceeded.');
  const graph = actorNavigationGraph(knowledge);
  const routes = graph.has(addressKey(position)) ? searchDirectedRoutes(graph, position) : undefined;
  const cellSources = new Map(cells.map(entry => [addressKey(entry.value.address), entry]));
  const connectionSources = (from: CellAddress, to: CellAddress) => [cellSources.get(addressKey(from))!,
    ...[cellSources.get(addressKey(to))].filter(entry => entry !== undefined),
    ...doors.filter(entry => sameAddress(entry.value.position, to)),
    ...blocked.filter(entry => sameAddress(entry.value.from, from) && sameAddress(entry.value.to, to))];
  const connections: RoomConnection[] = cells.flatMap(entry => compass.flatMap(direction => {
    const to = entry.value.exits[direction];
    if (!to || to.spaceId === entry.value.address.spaceId) return [];
    return [{ from: { ...entry.value.address }, to: { ...to }, direction,
      status: !graph.has(addressKey(to)) ? 'unknown-destination' as const
        : routeHasEdge(graph, entry.value.address, to) ? 'remembered-passable' as const : 'remembered-blocked' as const,
      evidence: evidence(connectionSources(entry.value.address, to), knowledge.revision) }];
  }));
  const neighbors = new Map<string, Set<string>>();
  const knownRooms = new Set(roomIds);
  for (const connection of connections) {
    if (!knownRooms.has(connection.to.spaceId)) continue;
    const next = neighbors.get(connection.from.spaceId) ?? new Set<string>();
    next.add(connection.to.spaceId);
    neighbors.set(connection.from.spaceId, next);
  }
  // Topological proximity includes remembered blocked crossings; reachability is separate.
  const roomHops = shortestRoutes(position.spaceId, key => [...(neighbors.get(key) ?? [])].sort(compareIds)
    .map(roomId => ({ key: roomId, edge: roomId })), DIRECTED_LIMITS.cells + 1);

  const routeTo = (targets: string[]): MemoryRoute => {
    if (!routes) return { status: 'unknown', reason: 'origin-not-remembered' };
    const known = targets.filter(key => graph.has(key));
    if (!known.length) return { status: 'unknown', reason: 'destination-not-remembered' };
    // Match planKnownDestination's equal-distance target selection, including mixed-case IDs.
    const destination = known.filter(key => routes.has(key)).sort((a, b) => routes.get(a)!.distance - routes.get(b)!.distance
      || a.localeCompare(b))[0];
    if (!destination) return { status: 'inaccessible', reason: 'no-known-route',
      evidence: evidence([...cells, ...doors, ...blocked], knowledge.revision) };
    const path = [routes.get(destination)!];
    while (path.at(-1)!.previous !== undefined) path.push(routes.get(path.at(-1)!.previous!)!);
    path.reverse();
    const pathKeys = new Set(path.map(node => node.key));
    return { status: 'known-route', distance: path.length - 1, firstRouteDirection: path[1]?.edge ?? null,
      evidence: evidence([...path.map(node => cellSources.get(node.key)!),
        ...doors.filter(entry => pathKeys.has(addressKey(entry.value.position)))], knowledge.revision) };
  };
  const featureTargets = (featureId: string) => {
    const feature = own(knowledge.features, featureId);
    return feature ? [...graph].filter(([, cell]) => sameAddress(cell.address, feature.value.position)
      || routeHasEdge(graph, cell.address, feature.value.position) || routeHasEdge(graph, feature.value.position, cell.address))
      .map(([key]) => key) : [];
  };
  const summarizeRoom = (roomId: string): RoomMemorySummary => {
    const space = own(knowledge.spaces, roomId);
    const roomCells = cells.filter(entry => entry.value.address.spaceId === roomId);
    const roomFeatures = features.filter(entry => entry.value.position.spaceId === roomId);
    return { roomId, name: space?.value.name ?? null, detail: 'summary-only', knownCells: roomCells.length,
      knownFeatures: roomFeatures.length, geographicBearing: geographicBearing(knowledge, position, roomId),
      route: routeTo(roomCells.map(entry => addressKey(entry.value.address))),
      evidence: evidence([...(space ? [space] : []), ...roomCells, ...roomFeatures], knowledge.revision) };
  };
  return { cells, features, roomIds, connections, roomHops, routeTo, featureTargets, summarizeRoom };
}
export type MemoryIndex = ReturnType<typeof createMemoryIndex>;

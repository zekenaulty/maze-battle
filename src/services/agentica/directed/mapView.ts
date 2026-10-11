import type { StreamKnowledgePage } from '../../../domain/expedition/streaming/types';

function roomSummary(page: StreamKnowledgePage) {
  return { roomId: page.spaceId, asOfRevision: page.revision, knownCellCount: Object.keys(page.cells).length,
    knownChestCount: Object.keys(page.chests).length,
    unopenedChestCount: Object.values(page.chests).filter(chest => !chest.opened).length,
    explorationCleared: page.cleared,
    connections: Object.values(page.openings).map(opening => ({ openingId: opening.id, direction: opening.direction,
      observedAt: opening.observedAt, ...(opening.destination ? { toRoomId: opening.destination.spaceId } : {}) })),
    frontiers: Object.values(page.frontiers).map(frontier => ({ id: frontier.id, direction: frontier.direction, observedAt: frontier.observedAt })) };
}

/** Reads only remembered pages. Limits apply to reads, not just the returned projection. */
export async function mapView(centerRoomId: string, depth: number, limit: number,
  read: (spaceId: string) => Promise<StreamKnowledgePage | undefined>) {
  const queue = [{ id: centerRoomId, depth: 0 }], scheduled = new Set([centerRoomId]);
  const rooms: ReturnType<typeof roomSummary>[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i], page = await read(item.id);
    if (!page) continue;
    rooms.push(roomSummary(page));
    if (item.depth >= depth) continue;
    const next = Object.values(page.openings).flatMap(value => value.destination ? [value.destination.spaceId] : []).sort();
    for (const id of next) if (!scheduled.has(id) && queue.length < limit) {
      scheduled.add(id); queue.push({ id, depth: item.depth + 1 });
    }
  }
  const included = new Set(rooms.map(room => room.roomId));
  return { kind: 'map' as const, status: rooms.some(room => room.roomId === centerRoomId) ? 'known' as const : 'unknown' as const,
    centerRoomId, depth, limit, rooms,
    boundaryRoomIds: [...new Set(rooms.flatMap(room => room.connections.flatMap(connection =>
      connection.toRoomId && !included.has(connection.toRoomId) ? [connection.toRoomId] : [])))].sort() };
}
export type MapView = Awaited<ReturnType<typeof mapView>>;

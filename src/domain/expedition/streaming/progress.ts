import { addressKey } from '../address';
import { resolvedSpaceSpec } from '../topology/projection';
import type { SpaceGeometry } from '../types';
import type { StreamCheckpoint, StreamKnowledgePage, StreamRoom } from './types';

/** Completion is a host predicate over this room and returned child waypoints. */
export function roomCleared(room: StreamRoom, page: StreamKnowledgePage, geometry: SpaceGeometry): boolean {
  const spec = resolvedSpaceSpec(room.space, room.connections);
  return geometry.cells.every(cell => page.cells[addressKey({ spaceId: spec.id, ...cell })])
    && spec.chests.every(chest => page.chests[chest.id]?.opened)
    && room.sockets.every(socket => socket.status === 'linked')
    && spec.openings.every(port => page.openings[port.id]?.destination
      && (port.id === page.parentOpeningId || page.completedExits.includes(port.id)));
}

export function updateClear(checkpoint: StreamCheckpoint, room: StreamRoom, page: StreamKnowledgePage, geometry: SpaceGeometry) {
  if (!page.cleared && roomCleared(room, page, geometry)) {
    page.cleared = true;
    checkpoint.clearedSpaces++;
  }
}

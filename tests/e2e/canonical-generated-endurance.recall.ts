import { readCanonicalRooms } from '../../src/persistence/canonical/knowledge/roomMap';
import { listRoomConnections } from '../../src/persistence/canonical/knowledge/graph.roomConnections';
import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { session } from './canonical-revisit.fixture';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5474') throw Error('Isolated generated recall fixture only');

export function rooms(cursor?: string) {
  return readCanonicalRooms(session().view.game!.snapshot, cursor);
}
export function connections(spaceId: string, cursor?: string) {
  const snapshot = session().view.game!.snapshot;
  return readCanonical((pages, pinned) => listRoomConnections(pages, gameCheckpoint(pinned.checkpoint), {
    level: gameCheckpoint(pinned.checkpoint).position.level, spaceId, limit: 1,
    ...(cursor === undefined ? {} : { cursor }),
  }), { snapshot });
}

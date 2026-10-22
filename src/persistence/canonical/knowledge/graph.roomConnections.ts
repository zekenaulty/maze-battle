import { checkpointJson, gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { jsonBytes } from '../validation';
import { GraphCursorRefusal } from './graph.cursor';
import { graphView } from './graph.read';
import { readRoomConnectionsCursor, roomConnectionsCursor, roomConnectionsScope } from './graph.roomConnections.cursor';
import { walkRoomConnections } from './graph.roomConnections.walk';
import type { RoomConnectionsPage, RoomConnectionsScope } from './graph.roomConnections.types';
import type { KnowledgeRead } from './types';

export type { ConnectionRoom, RoomConnection, RoomConnectionsPage, RoomConnectionsScope } from './graph.roomConnections.types';

/** Earned indexed room exits only; stop at the next room. No world reads, scans or sight refresh.
 * Each page revalidates the bounded component, including cursor membership/path evidence.
 * Exhausting the shared 256 reads / 1 MiB budget throws, never returns a truncated or empty success.
 * Missing graph availability and corrupt sources retain the graph reader's fail-closed errors.
 * Proof digests require this same reader and immutable knowledge root to validate; they grant no authority.
 */
export async function listRoomConnections(pages: KnowledgeRead, before: GameCheckpoint, input: RoomConnectionsScope): Promise<RoomConnectionsPage> {
  const checkpoint = gameCheckpoint(checkpointJson(before)), scope = roomConnectionsScope(input);
  const view = await graphView(pages, checkpoint, scope.level);
  const after = readRoomConnectionsCursor(scope.cursor, view.anchor, scope);
  const found = await walkRoomConnections(view, scope.spaceId);
  const index = after ? found.connections.findIndex(c => c.room.spaceId === after.spaceId && c.proof.digest === after.digest) : -1;
  if (after && (index < 0 || index >= found.connections.length - 1)) throw new GraphCursorRefusal('Room connection cursor has no continuation');
  const items = found.connections.slice(index + 1, index + 1 + scope.limit);
  const result: RoomConnectionsPage = { anchor: view.anchor, from: found.from, items,
    state: found.partial ? 'partial' : 'complete', ...(found.partial ? { reason: 'unseen-passage' as const } : {}),
    ...(index + 1 + items.length < found.connections.length
      ? { next: roomConnectionsCursor(view.anchor, scope, items.at(-1)!) } : {}) };
  jsonBytes(result, 4096); return result;
}

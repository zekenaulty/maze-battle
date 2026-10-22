import { encodeRoster, fields, id, natural } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { GraphCursorRefusal } from './graph.cursor';
import { knowledgeAnchor } from './validation';
import type { KnowledgeAnchor } from './types';
import type { RoomConnection, RoomConnectionsScope } from './graph.roomConnections.types';

export function roomConnectionsScope(input: RoomConnectionsScope) {
  input = encodeRoster(input, ['cursor', 'limit']) as unknown as RoomConnectionsScope;
  const s = fields(input, 'level spaceId', 'cursor limit'); natural(s.level, 1); id(s.spaceId);
  const limit = s.limit ?? 4; natural(limit, 1); check(limit <= 4, 'invalid room connection page size');
  check(s.cursor === undefined || typeof s.cursor === 'string' && s.cursor.length <= 1024, 'invalid room connection cursor');
  return structuredClone({ ...input, limit });
}
export function readRoomConnectionsCursor(cursor: string | undefined, anchor: KnowledgeAnchor, scope: RoomConnectionsScope) {
  if (cursor === undefined) return null;
  try {
    jsonBytes(cursor, 2048);
    const c = fields(JSON.parse(cursor), 'schema scope level spaceId anchor after'); knowledgeAnchor(c.anchor);
    check(JSON.stringify(c) === cursor && c.schema === 1 && c.scope === 'room-connections'
      && c.level === scope.level && c.spaceId === scope.spaceId && same(c.anchor, anchor), 'stale or foreign room connection cursor');
    const after = fields(c.after, 'spaceId digest'); id(after.spaceId);
    check(typeof after.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(after.digest), 'invalid path commitment');
    return { spaceId: after.spaceId, digest: after.digest };
  } catch { throw new GraphCursorRefusal('Invalid room connection continuation'); }
}
/** Private knowledge-bound token. The public consumer must also pin it to the original publication/query. */
export function roomConnectionsCursor(anchor: KnowledgeAnchor, scope: RoomConnectionsScope, last: RoomConnection) {
  const value = JSON.stringify({ schema: 1, scope: 'room-connections', level: scope.level, spaceId: scope.spaceId,
    anchor, after: { spaceId: last.room.spaceId, digest: last.proof.digest } });
  check(value.length <= 1024, 'room connection cursor exceeds bound'); return value;
}
